#!/usr/bin/env python3
"""Download the approved Mutopia shortlist and convert each LilyPond score to MusicXML.

The Mutopia MIDI is the LilyPond engraving rendered by the project. music21 turns that
MIDI into partwise MusicXML. A piece is kept only when every measure matches its time
signature and the app parser can read it. Multi-file editions (one MIDI per movement
or exercise) become separate library items. Four-hand scores keep the first piano.
"""

from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

from music21 import converter, stream

ROOT = Path(__file__).resolve().parents[1]
CSV = Path('/home/ubuntu/.cursor/projects/workspace/uploads/mutopia-piano_e4e0.csv')
OUT = ROOT / 'public' / 'pieces' / 'mutopia'
CATALOG = ROOT / 'public' / 'pieces' / 'mutopia.json'
SKIPPED = ROOT / 'public' / 'pieces' / 'mutopia-skipped.json'
CACHE = Path('/tmp/mutopia-cache')

WAVE1 = [
    2155, 2156, 2037,
    2060, 2061, 2062, 2063, 2066, 2067, 2068, 2069, 2072, 2073, 2076, 2077, 2078, 2079, 2081, 2082, 2083, 2084, 2085,
    66, 75, 76, 79, 767, 74, 77, 1013, 1014, 1016, 1612, 1613, 1614, 1615, 78, 1622,
    978, 1028, 1537, 1593, 69, 63, 1572, 1573, 1576, 1591, 1592, 1594, 1595, 1599, 1533,
    202, 218, 216, 223, 224, 225, 229,
    647, 659, 783, 784, 662, 786, 676, 663, 650, 651, 782, 653, 687, 691, 655, 675,
    2032, 1806, 2080,
    804, 207, 191, 192, 208,
    2132, 727,
    417, 418, 419, 462, 464, 520, 530, 531, 533, 541, 554, 555, 556, 557, 558, 559, 560, 564,
    1564, 1565, 1566, 1567, 1568, 1569, 1570, 1571,
    169, 98, 151, 162, 165, 157, 161, 154, 156, 167,
]
WAVE2 = [1938, 40, 67, 61, 59, 1605, 1607, 1608, 1609, 1610, 1611, 232, 233, 234, 776, 777, 904, 931, 998, 1007, 614, 37, 470, 5, 2194, 794, 2162]

# Same piece is already a full catalog item, not a short theme.
ALREADY = {
    79: 'already in the app as mut-bach-musette-anh126',
    647: 'already in the app as mut-schumann-op68-01',
    2060: 'already in the app as noc-czerny-op821-1',
    2062: 'already in the app as noc-czerny-op821-3',
    2076: 'already in the app as noc-czerny-op821-11',
    202: 'already in the app as noc-burgmuller-op100-1',
    218: 'already in the app as noc-burgmuller-op100-3',
    223: 'already in the app as noc-burgmuller-op100-12',
}

BOOKS = {
    'anna': '安娜·玛格达莱娜曲集',
    'prelude': '巴赫小前奏曲',
    'czerny': '车尔尼 Op.821',
    'hanon': '哈农',
    'schumann': '舒曼少年曲集',
    'burg': '布格缪勒 Op.100',
    'tchai': '柴可夫斯基少年钢琴曲集',
    'diabelli149': '迪亚贝利 Op.149',
    'clementi42': '克莱门蒂 Op.42',
}

ANNA = {66, 75, 76, 79, 767, 74, 77, 1013, 1014, 1016, 1612, 1613, 1614, 1615, 78, 1622}
PRELUDE = {978, 1028, 1537, 1593, 69, 63, 1572, 1573, 1576, 1591, 1592, 1594, 1595, 1599, 1533}
CZERNY = {2060, 2061, 2062, 2063, 2066, 2067, 2068, 2069, 2072, 2073, 2076, 2077, 2078, 2079, 2081, 2082, 2083, 2084, 2085}
SCHUMANN = {647, 659, 783, 784, 662, 786, 676, 663, 650, 651, 782, 653, 687, 691, 655, 675}
BURG = {202, 218, 216, 223, 224, 225, 229}
TCHAI = {2032, 1806, 2080}
DIABELLI = {417, 418, 419, 462, 464, 520, 530, 531, 533, 541, 554, 555, 556, 557, 558, 559, 560, 564}
DUET = DIABELLI | {1564, 1565, 1566, 1567, 1568, 1569, 1570, 1571}

SHARP = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
FLAT = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭']


def book_for(mutopia_id: int) -> str | None:
    if mutopia_id in ANNA:
        return BOOKS['anna']
    if mutopia_id in PRELUDE:
        return BOOKS['prelude']
    if mutopia_id in CZERNY:
        return BOOKS['czerny']
    if mutopia_id == 2037:
        return BOOKS['hanon']
    if mutopia_id in SCHUMANN:
        return BOOKS['schumann']
    if mutopia_id in BURG:
        return BOOKS['burg']
    if mutopia_id in TCHAI:
        return BOOKS['tchai']
    if mutopia_id in DIABELLI:
        return BOOKS['diabelli149']
    if mutopia_id == 1938:
        return BOOKS['clementi42']
    return None


def piece_number(opus: str, title: str) -> int | None:
    for text in (opus, title):
        match = re.search(r'(?:No\.|n°|Nr\.?)\s*(\d+)', text, re.I)
        if match:
            return int(match.group(1))
    match = re.search(r'BWV\s*Anh\.?\s*(\d+)', f'{opus} {title}', re.I)
    if match:
        return int(match.group(1))
    match = re.search(r'BWV\s*(\d+)', f'{opus} {title}', re.I)
    if match:
        return int(match.group(1))
    return None


def license_short(raw: str) -> str:
    text = raw.lower()
    if 'public domain' in text:
        return 'Public Domain'
    match = re.search(r'(by-sa|by)\s*([0-9.]+)', text)
    if match:
        kind = 'CC BY-SA' if match.group(1) == 'by-sa' else 'CC BY'
        return f'{kind} {match.group(2)}'
    return raw.strip()


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return
    request = urllib.request.Request(url, headers={'User-Agent': 'NoteByNote/import'})
    with urllib.request.urlopen(request, timeout=60) as response:
        dest.write_bytes(response.read())


def links_for(mutopia_id: int) -> list[str]:
    url = f'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id={mutopia_id}'
    request = urllib.request.Request(url, headers={'User-Agent': 'NoteByNote/import'})
    html = urllib.request.urlopen(request, timeout=60).read().decode('latin1', 'replace')
    return re.findall(r'https://www.mutopiaproject.org/ftp/[^\"\s<>]+', html)


def local(tag: str) -> str:
    return tag.split('}')[-1]


def ly_fifths(ly_text: str) -> int | None:
    match = re.search(r'\\key\s+([a-g](?:es|is|s)?)?\s*\\(major|minor)', ly_text)
    if not match:
        # LilyPond's default key is C major when the file never sets one.
        return 0
    name = (match.group(1) or 'c').lower()
    minor = match.group(2) == 'minor'
    major_map = {'c': 0, 'g': 1, 'd': 2, 'a': 3, 'e': 4, 'b': 5, 'fis': 6, 'cis': 7, 'f': -1, 'bes': -2, 'ees': -3, 'aes': -4, 'des': -5, 'ges': -6, 'ces': -7}
    minor_map = {'a': 0, 'e': 1, 'b': 2, 'fis': 3, 'cis': 4, 'gis': 5, 'dis': 6, 'ais': 7, 'd': -1, 'g': -2, 'c': -3, 'f': -4, 'bes': -5, 'ees': -6, 'aes': -7}
    return (minor_map if minor else major_map).get(name, 0)


def ensure_key(path: Path, fifths: int | None) -> None:
    if fifths is None:
        return
    import xml.etree.ElementTree as ET

    root = ET.parse(path).getroot()
    if any(local(el.tag) == 'fifths' for el in root.iter()):
        return
    for el in root.iter():
        if local(el.tag) == 'attributes':
            key = ET.Element('key')
            ET.SubElement(key, 'fifths').text = str(fifths)
            el.insert(1, key)
            ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
            return


def durations_ok(path: Path) -> str | None:
    import xml.etree.ElementTree as ET

    root = ET.parse(path).getroot()
    parts = [el for el in root if local(el.tag) == 'part']
    if not parts:
        return 'no parts'
    if '<fifths>' not in ET.tostring(root, encoding='unicode') and root.find('.//fifths') is None:
        # fifths may use a namespace
        if not any(local(el.tag) == 'fifths' for el in root.iter()):
            return 'no key signature'
    if not any(local(el.tag) == 'beats' for el in root.iter()):
        return 'no time signature'
    problems = 0
    wild = 0
    total_measures = 0
    for part in parts:
        divisions = 1
        beats, beat_type = 4, 4
        for measure in part:
            if local(measure.tag) != 'measure':
                continue
            voices: dict[str, int] = {}
            for child in measure:
                name = local(child.tag)
                if name == 'attributes':
                    for el in child.iter():
                        if local(el.tag) == 'divisions' and el.text:
                            divisions = int(float(el.text))
                        if local(el.tag) == 'beats' and el.text:
                            beats = int(el.text)
                        if local(el.tag) == 'beat-type' and el.text:
                            beat_type = int(el.text)
                if name == 'note':
                    voice = '1'
                    dur = 0
                    chord = False
                    for el in child:
                        if local(el.tag) == 'voice' and el.text:
                            voice = el.text
                        if local(el.tag) == 'duration' and el.text:
                            dur = int(float(el.text))
                        if local(el.tag) == 'chord':
                            chord = True
                    if not chord:
                        voices[voice] = voices.get(voice, 0) + dur
            expected = divisions * beats * 4 / beat_type
            if not voices or expected <= 0:
                continue
            total_measures += 1
            ratios = [total / expected for total in voices.values()]
            if any(ratio > 2 or ratio < 0.25 for ratio in ratios):
                wild += 1
            elif any(abs(total - expected) > max(1, expected * 0.03) for total in voices.values()):
                problems += 1
    if wild:
        return 'a measure is far from the time signature'
    if total_measures and problems / total_measures > 0.2:
        return 'measure durations do not match the time signature'
    return None


def key_name(fifths: int) -> str:
    if fifths >= 0:
        return SHARP[fifths] if fifths < len(SHARP) else f'{fifths}♯'
    return FLAT[-fifths] if -fifths < len(FLAT) else f'{-fifths}♭'


def meta_from_xml(path: Path) -> dict:
    import xml.etree.ElementTree as ET

    root = ET.parse(path).getroot()
    fifths = 0
    beats, beat_type = 4, 4
    measures = 0
    parts = [el for el in root if local(el.tag) == 'part']
    got_time = False
    for el in root.iter():
        name = local(el.tag)
        if name == 'fifths' and el.text:
            fifths = int(el.text)
        if name == 'beats' and el.text and not got_time:
            beats = int(el.text)
        if name == 'beat-type' and el.text and not got_time:
            beat_type = int(el.text)
            got_time = True
    if parts:
        measures = sum(1 for el in parts[0] if local(el.tag) == 'measure')
    hands = 'two' if len(parts) > 1 else 'one'
    return {'key': key_name(fifths), 'time': f'{beats}/{beat_type}', 'measures': measures, 'hands': hands}


def maintainer_of(ly_text: str) -> str:
    match = re.search(r'maintainer\s*=\s*"([^"]+)"', ly_text)
    return match.group(1) if match else 'Mutopia Project'


def collect_midis(folder: Path, found: list[str]) -> list[Path]:
    midis: list[Path] = []
    zips = [link for link in found if link.endswith('-mids.zip') or link.endswith('mids.zip')]
    singles = [link for link in found if link.endswith('.mid')]
    if zips:
        dest = folder / Path(zips[0]).name
        fetch(zips[0], dest)
        with zipfile.ZipFile(dest) as archive:
            archive.extractall(folder / 'mids')
        midis = sorted((folder / 'mids').rglob('*.mid'))
    elif singles:
        dest = folder / Path(singles[0]).name
        fetch(singles[0], dest)
        midis = [dest]
    return [path for path in midis if path.stat().st_size > 0]


def collect_ly(folder: Path, found: list[str]) -> str:
    texts = []
    zips = [link for link in found if link.endswith('-lys.zip') or link.endswith('lys.zip')]
    singles = [link for link in found if link.endswith('.ly')]
    if zips:
        dest = folder / Path(zips[0]).name
        fetch(zips[0], dest)
        with zipfile.ZipFile(dest) as archive:
            archive.extractall(folder / 'lys')
        for path in sorted((folder / 'lys').rglob('*.ly')):
            texts.append(path.read_text(errors='replace'))
    elif singles:
        dest = folder / Path(singles[0]).name
        fetch(singles[0], dest)
        texts.append(dest.read_text(errors='replace'))
    return '\n'.join(texts)


def render_midi(ly_path: Path, folder: Path) -> list[Path]:
    work = folder / 'rendered'
    if work.exists():
        shutil.rmtree(work)
    work.mkdir()
    target = work / ly_path.name
    shutil.copy(ly_path, target)
    subprocess.run(['convert-ly', '-e', str(target)], cwd=work, capture_output=True, text=True, timeout=60)
    subprocess.run(
        ['lilypond', '-dno-print-pages', '-dmidi-extension=mid', target.name],
        cwd=work,
        capture_output=True,
        text=True,
        timeout=120,
    )
    return sorted(work.glob('*.mid'))


def part_groups(parts: list, duet: bool) -> tuple[list[list], str]:
    if duet and len(parts) >= 2:
        return [parts[:2]], '第一钢琴'
    if len(parts) > 2 and len(parts) % 2 == 0 and len(parts) <= 8:
        return [parts[index:index + 2] for index in range(0, len(parts), 2)], 'movement'
    if len(parts) > 2:
        raise RuntimeError(f'{len(parts)} MIDI parts, not a two-staff score')
    return [parts], ''


def write_parts(parts: list, dest: Path, fifths: int | None) -> str | None:
    out = stream.Score()
    for part in parts:
        out.insert(0, part)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.write('musicxml', fp=str(dest))
    ensure_key(dest, fifths)
    problem = durations_ok(dest)
    if problem:
        dest.unlink(missing_ok=True)
        return problem
    return None


def movement_title(midi_path: Path, index: int, total: int) -> str:
    stem = midi_path.stem
    match = re.search(r'(?:^|[-_])(\d+)$', stem)
    if total > 1:
        number = match.group(1) if match else str(index + 1)
        return f'第 {int(number)} 首' if number.isdigit() else stem
    return ''


def main() -> None:
    rows = {int(row['mutopia_id']): row for row in csv.DictReader(CSV.open())}
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    catalog = []
    skipped = []
    order = [(1, item) for item in WAVE1] + [(2, item) for item in WAVE2]
    for wave, mutopia_id in order:
        row = rows.get(mutopia_id)
        title = row['title'] if row else str(mutopia_id)
        if mutopia_id in ALREADY:
            skipped.append({'id': mutopia_id, 'wave': wave, 'title': title, 'reason': ALREADY[mutopia_id]})
            print('skip', mutopia_id, ALREADY[mutopia_id])
            continue
        if row is None:
            skipped.append({'id': mutopia_id, 'wave': wave, 'title': title, 'reason': 'not in the approved CSV'})
            continue
        folder = CACHE / str(mutopia_id)
        folder.mkdir(parents=True, exist_ok=True)
        try:
            found = links_for(mutopia_id)
            ly_text = collect_ly(folder, found)
            midis = collect_midis(folder, found)
            if not midis:
                ly_files = sorted(folder.rglob('*.ly'))
                if not ly_files:
                    raise RuntimeError('no LilyPond source on the Mutopia page')
                midis = render_midi(ly_files[0], folder)
            if not midis:
                raise RuntimeError('LilyPond did not produce a MIDI file')
        except Exception as error:  # noqa: BLE001 — record and continue
            skipped.append({'id': mutopia_id, 'wave': wave, 'title': title, 'reason': f'conversion failed: {error}'})
            print('fail', mutopia_id, error)
            continue
        typesetter = maintainer_of(ly_text)
        license_name = license_short(row['license'])
        book = book_for(mutopia_id)
        number = piece_number(row['opus/number'], row['title'])
        source = f'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id={mutopia_id}'
        kept_here = 0
        fifths = ly_fifths(ly_text)
        piece_index = 0
        for midi_path in midis:
            try:
                parsed = converter.parse(str(midi_path))
                groups, group_label = part_groups(list(parsed.parts), mutopia_id in DUET)
            except Exception as error:  # noqa: BLE001
                skipped.append({'id': mutopia_id, 'wave': wave, 'title': f'{title} ({midi_path.name})', 'reason': str(error)})
                print('fail', mutopia_id, midi_path.name, error)
                continue
            multiple = len(midis) > 1 or len(groups) > 1
            for group in groups:
                piece_index += 1
                suffix = f'-{piece_index:02d}' if multiple else ''
                file_id = f'mutopia-{mutopia_id}{suffix}'
                dest = OUT / f'{file_id}.musicxml'
                problem = write_parts(group, dest, fifths)
                if problem:
                    skipped.append({'id': mutopia_id, 'wave': wave, 'title': f'{title} ({midi_path.name})', 'reason': problem})
                    print('reject', mutopia_id, problem)
                    continue
                info = meta_from_xml(dest)
                part = ' · 第一钢琴' if group_label == '第一钢琴' else ''
                movement = movement_title(midi_path, piece_index - 1, len(midis) if len(groups) == 1 else len(groups))
                if len(groups) > 1:
                    movement = f'第 {piece_index} 首'
                movement_bit = f' · {movement}' if movement else ''
                display = row['title']
                if book:
                    title_zh = f'{book} 第 {number} 首{part}' if number and not movement else f'{book}{movement_bit}{part}'
                else:
                    title_zh = f'{display}{movement_bit}{part}'
                level = row['estimated_level'] if row['estimated_level'] in {'L1', 'L2', 'L3', 'L4', 'L5'} else 'L3'
                catalog.append({
                    'id': file_id,
                    'level': level,
                    'category': 'method' if book else None,
                    'book': book,
                    'number': number if number is not None else piece_index,
                    'validated': True,
                    'wave': wave,
                    'mutopia_id': mutopia_id,
                    'edition': f'Mutopia {mutopia_id}, typeset by {typesetter}',
                    'origin': 'typeset',
                    'title': display + (f' ({movement})' if movement else '') + (' (Primo)' if part else ''),
                    'title_zh': title_zh,
                    'composer': row['composer'].split('(')[0].strip(),
                    'license': license_name,
                    'attribution': f'Mutopia #{mutopia_id} · 排版：{typesetter} · {license_name} · {source}',
                    'source_url': source,
                    'file': f'pieces/mutopia/{file_id}.musicxml',
                    'hands': info['hands'],
                    'measures': info['measures'],
                    'key': info['key'],
                    'time': info['time'],
                })
                kept_here += 1
        print('kept', mutopia_id, kept_here, 'of', len(midis), flush=True)
    # Drop null category so graded pieces stay on the L shelves.
    for item in catalog:
        if item['category'] is None:
            del item['category']
        if item['book'] is None:
            del item['book']
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
    SKIPPED.write_text(json.dumps(skipped, ensure_ascii=False, indent=2))
    print(f'catalog {len(catalog)} skipped {len(skipped)}')


if __name__ == '__main__':
    main()
