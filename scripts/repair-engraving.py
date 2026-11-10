"""Make both staves share every measure, and drop tempo marks OSMD swallows."""
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path('/workspace/public/pieces')

def local(tag):
    return tag.split('}')[-1] if tag else ''

def read_score(path: Path):
    if path.suffix == '.mxl':
        with zipfile.ZipFile(path) as archive:
            names = [name for name in archive.namelist() if name not in ('mimetype',) and 'META-INF' not in name]
            xml_name = next(name for name in names if name.endswith(('.xml', '.musicxml')))
            return xml_name, archive.read(xml_name).decode('utf-8'), True
    return path.name, path.read_text(encoding='utf-8'), False

def write_score(path: Path, xml_name: str, text: str, compressed: bool):
    if not compressed:
        path.write_text(text, encoding='utf-8')
        return
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        info = zipfile.ZipInfo('mimetype')
        info.compress_type = zipfile.ZIP_STORED
        archive.writestr(info, 'application/vnd.recordare.musicxml+xml')
        container = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<container><rootfiles><rootfile full-path="%s" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>'
            % xml_name
        )
        archive.writestr('META-INF/container.xml', container)
        archive.writestr(xml_name, text)
    path.write_bytes(buffer.getvalue())

DIRECTION = re.compile(
    r'<direction\b[^>]*>(?:\s*<staff>\d+</staff>)?\s*<sound\b[^>]*/>\s*</direction>',
    re.S,
)

def strip_bare_tempos(text: str) -> tuple[str, int]:
    updated, count = DIRECTION.subn('', text)
    return updated, count

def measure_length(divisions: int, beats: int, beat_type: int) -> int:
    return int(round(beats * divisions * 4 / beat_type))

def pad_parts(text: str) -> tuple[str, int]:
    root = ET.fromstring(text)
    parts = [element for element in root if local(element.tag) == 'part']
    if len(parts) < 2:
        return text, 0
    numbers = []
    for part in parts:
        for measure in part:
            if local(measure.tag) == 'measure' and measure.get('number') and measure.get('number').lstrip('-').isdigit():
                numbers.append(int(measure.get('number')))
    if not numbers:
        return text, 0
    wanted = list(range(min(numbers), max(numbers) + 1))
    inserted = 0
    for part in parts:
        measures = [element for element in part if local(element.tag) == 'measure']
        present = {int(measure.get('number')) for measure in measures if measure.get('number') and measure.get('number').lstrip('-').isdigit()}
        missing = [number for number in wanted if number not in present]
        if not missing:
            continue
        divisions, beats, beat_type = 1, 4, 4
        for measure in measures:
            for element in measure:
                if local(element.tag) != 'attributes':
                    continue
                for child in element:
                    if local(child.tag) == 'divisions' and child.text:
                        divisions = int(child.text)
                    if local(child.tag) == 'time':
                        for item in child:
                            if local(item.tag) == 'beats' and item.text:
                                beats = int(item.text)
                            if local(item.tag) == 'beat-type' and item.text:
                                beat_type = int(item.text)
        duration = measure_length(divisions, beats, beat_type)
        # Insert before </part> of this part, in number order, using the raw text.
        pid = part.get('id')
        block = '\n'.join(
            f'    <measure number="{number}">\n      <note><rest measure="yes"/><duration>{duration}</duration></note>\n    </measure>'
            for number in missing
        )
        pattern = re.compile(rf'(<part id="{re.escape(pid)}"[^>]*>)(.*?)(</part>)', re.S)
        match = pattern.search(text)
        if not match:
            continue
        body = match.group(2)
        # Place each missing measure after the nearest lower existing number.
        for number in missing:
            snippet = (
                f'\n    <measure number="{number}">\n'
                f'      <note><rest measure="yes"/><duration>{duration}</duration></note>\n'
                f'    </measure>'
            )
            previous = [int(found) for found in re.findall(r'<measure[^>]*number="(\d+)"', body)]
            lower = [value for value in previous if value < number]
            if not lower:
                body = snippet + body
            else:
                anchor = max(lower)
                token = f'number="{anchor}"'
                start = body.rfind(token)
                end = body.find('</measure>', start)
                body = body[: end + len('</measure>')] + snippet + body[end + len('</measure>') :]
            inserted += 1
        text = text[: match.start()] + match.group(1) + body + match.group(3) + text[match.end() :]
    return text, inserted

def main():
    changed = []
    for path in sorted(ROOT.rglob('*')):
        if path.suffix not in {'.mxl', '.musicxml'}:
            continue
        xml_name, text, compressed = read_score(path)
        original = text
        text, tempos = strip_bare_tempos(text)
        text, pads = pad_parts(text)
        if text != original:
            write_score(path, xml_name, text, compressed)
            changed.append(f'{path.relative_to(ROOT)} tempos={tempos} pads={pads}')
    print('\n'.join(changed))
    print('changed', len(changed))

if __name__ == '__main__':
    main()
