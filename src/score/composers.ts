/**
 * 曲库里的作曲家名字来自四个来源（opensongs、Mutopia、PDMX、Noctave），
 * 同一个人的缩写、全名、括号注释各不相同。这里把它们折回同一个人，
 * 否则按作曲家分组时巴赫会裂成四块。
 */

/** 键是小写原名字段，值是要显示的标准名。 */
const CANONICAL = new Map<string, string>([
  ['j. s. bach', 'Johann Sebastian Bach'],
  ['j.s. bach', 'Johann Sebastian Bach'],
  ['j. s. bach (anna magdalena notebook)', 'Johann Sebastian Bach'],
  ['c. p. e. bach', 'Carl Philipp Emanuel Bach'],
  ['j. c. f. bach', 'Johann Christoph Friedrich Bach'],
  ['m. clementi', 'Muzio Clementi'],
  ['w. a. mozart', 'Wolfgang Amadeus Mozart'],
  ['l. v. beethoven', 'Ludwig van Beethoven'],
  ['c. czerny', 'Carl Czerny'],
  ['r. schumann', 'Robert Schumann'],
  ['f. f. chopin', 'Frédéric Chopin'],
  ['j. brahms', 'Johannes Brahms'],
  ['b. bartók', 'Béla Bartók'],
  ['e. satie', 'Erik Satie'],
  ['g. f. handel', 'George Frideric Handel'],
  ['a. diabelli', 'Anton Diabelli'],
  ['p. i. tchaikovsky', 'Pyotr Ilyich Tchaikovsky'],
  ['f. kuhlau', 'Friedrich Kuhlau'],
  ['j. f. f. burgmüller', 'Johann Friedrich Franz Burgmüller'],
  ['friedrich burgmüller', 'Johann Friedrich Franz Burgmüller'],
  ['c. l. hanon', 'Charles-Louis Hanon'],
  ['louis streabbog', 'Louis Streabbog'],
  ['louis streabbog (gobbaerts)', 'Louis Streabbog'],
  ['f. behr', 'Franz Behr'],
  ['j. andré', 'Johann André'],
  ['anonymous', 'Traditional'],
  ['traditional (french)', 'Traditional'],
  ['traditional (english)', 'Traditional'],
  ['traditional (new britain)', 'Traditional'],
  ['traditional (scottish)', 'Traditional'],
])

/** 数量少于这个值的作曲家合并进「其他作曲家」，避免出现几十个只有一首的组。 */
export const SHELF_MIN_PIECES = 3

export const OTHER_COMPOSERS = '其他作曲家'

/** 把各种拼写折回标准名。认不出来的名字原样返回。 */
export function composerName(raw: string): string {
  const key = raw.trim().toLowerCase()
  return CANONICAL.get(key) ?? raw.trim()
}

const ROMAN_TAIL = /\s+(?:i{1,3}|iv|v|vi{0,3}|ix|x)$/i

/**
 * 排序用的键：取姓名最后一个词，这样贝多芬排在 B 而不是 L。
 * 去掉括号注释和「施特劳斯二世」这类罗马数字后缀。
 */
export function composerSortKey(raw: string): string {
  const base = composerName(raw)
    .replace(/\([^)]*\)/g, ' ')
    .replace(ROMAN_TAIL, '')
    .trim()
  const words = base.split(/[\s.]+/).filter(Boolean)
  return (words[words.length - 1] ?? base).toLowerCase()
}
