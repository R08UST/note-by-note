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

/** 标准名对应的中文译名，让「巴赫」「肖邦」这样的搜索能找到没有中文标题的曲子。 */
const CHINESE = new Map<string, string>([
  ['Johann Sebastian Bach', '巴赫'],
  ['Carl Philipp Emanuel Bach', 'C.P.E.巴赫'],
  ['Johann Christoph Friedrich Bach', 'J.C.F.巴赫'],
  ['Traditional', '传统民歌'],
  ['Muzio Clementi', '克莱门蒂'],
  ['Wolfgang Amadeus Mozart', '莫扎特'],
  ['Leopold Mozart', '利奥波德·莫扎特'],
  ['Ludwig van Beethoven', '贝多芬'],
  ['Carl Czerny', '车尔尼'],
  ['Frédéric Chopin', '肖邦'],
  ['Henry Lemoine', '勒穆瓦纳'],
  ['Anton Diabelli', '迪亚贝利'],
  ['Robert Schumann', '舒曼'],
  ['George Frideric Handel', '亨德尔'],
  ['Domenico Scarlatti', '斯卡拉蒂'],
  ['Johann Friedrich Franz Burgmüller', '布格缪勒'],
  ['Charles-Louis Hanon', '哈农'],
  ['J. L. Dussek', '杜赛克'],
  ['Erik Satie', '萨蒂'],
  ['Jean-Baptiste Duvernoy', '迪维诺瓦'],
  ['Jean-Philippe Rameau', '拉莫'],
  ['Claude Debussy', '德彪西'],
  ['Franz Liszt', '李斯特'],
  ['Scott Joplin', '乔普林'],
  ['Giuseppe Verdi', '威尔第'],
  ['Johannes Brahms', '勃拉姆斯'],
  ['Sergei Rachmaninoff', '拉赫玛尼诺夫'],
  ['Joseph Haydn', '海顿'],
  ['Franz Schubert', '舒伯特'],
  ['Alexander Scriabin', '斯克里亚宾'],
  ['Edvard Grieg', '格里格'],
  ['Pyotr Ilyich Tchaikovsky', '柴可夫斯基'],
  ['Antonín Dvořák', '德沃夏克'],
  ['Felix Mendelssohn', '门德尔松'],
  ['Nikolai Rimsky-Korsakov', '里姆斯基-科萨科夫'],
  ['John Philip Sousa', '苏萨'],
  ['Richard Wagner', '瓦格纳'],
  ['Charles-Valentin Alkan', '阿尔坎'],
  ['Johann Pachelbel', '帕赫贝尔'],
  ['Béla Bartók', '巴托克'],
  ['John Field', '菲尔德'],
  ['Christian Petzold', '佩措尔德'],
  ['Friedrich Kuhlau', '库劳'],
  ['Jacques Offenbach', '奥芬巴赫'],
  ['Henri Bertini', '贝尔蒂尼'],
  ['Cornelius Gurlitt', '古利特'],
  ['Maurice Ravel', '拉威尔'],
  ['Enrique Granados', '格拉纳多斯'],
  ['Isaac Albéniz', '阿尔贝尼斯'],
  ['Stephen Foster', '福斯特'],
  ['Antonio Vivaldi', '维瓦尔第'],
  ['Louis Streabbog', '斯特里博格'],
  ['Johann Nepomuk Hummel', '胡梅尔'],
  ['Anatoly Lyadov', '利亚多夫'],
  ['Modest Mussorgsky', '穆索尔斯基'],
  ['François Couperin', '库普兰'],
  ['Johann Strauss II', '小约翰·施特劳斯'],
  ['Johann Strauss I', '老约翰·施特劳斯'],
  ['Yiruma', '李闰珉'],
  ['Joe Hisaishi', '久石让'],
  ['Ryuichi Sakamoto', '坂本龙一'],
  ['Hans Zimmer', '汉斯·季默'],
  ['Kenshi Yonezu', '米津玄师'],
  ['Go Shiina', '椎名豪'],
  ['Nobuo Uematsu', '植松伸夫'],
  ['Koji Kondo', '近藤浩治'],
  ['Evan Call', '埃文·考尔'],
  ['Gustav Mahler', '马勒'],
  ['Mariah Carey', '玛丽亚·凯莉'],
  ['Mykola Leontovych', '列昂托维奇'],
  ['Vincenzo Bellini', '贝里尼'],
  ['Yoko Shimomura', '下村阳子'],
  ['Shunsuke Kikuchi', '菊池俊辅'],
  ['Yasuharu Takanashi', '高梨康治'],
  ['François-Joseph Gossec', '戈塞克'],
  ['Francisco Tárrega', '塔雷加'],
  ['Yojiro Noda', '野田洋次郎'],
  ['Gustav Holst', '霍尔斯特'],
  ['Pietro Mascagni', '马斯卡尼'],
  ['George Michael', '乔治·迈克尔'],
  ['Junichi Masuda', '增田顺一'],
  ['Louis-Claude Daquin', '达坎'],
  ['Hiroyuki Sawano', '泽野弘之'],
  ['Victor Herbert', '赫伯特'],
  ['Anton Rubinstein', '鲁宾斯坦'],
  ['Giacomo Puccini', '普契尼'],
  ['Satoru Kosaki', '神前晓'],
  ['Kurousa-P', '黑兔P'],
  ['Marc-Antoine Charpentier', '夏庞蒂埃'],
  ['Bedřich Smetana', '斯美塔那'],
  ['Ruggero Leoncavallo', '莱翁卡瓦洛'],
  ['Yasunori Mitsuda', '光田康典'],
  ['Kayoko Kusano', '草野华余子'],
  ['Hidetoshi Satō', '佐藤英敏'],
  ['Yoko Kanno', '菅野洋子'],
  ['Akira Senju', '千住明'],
  ['Ludovico Einaudi', '鲁多维科·伊诺第'],
  ['Klaus Badelt', '克劳斯·巴德尔特'],
  ['Ramin Djawadi', '拉明·贾瓦迪'],
  ['James Horner', '詹姆斯·霍纳'],
  ['Alan Silvestri', '艾伦·西尔维斯特里'],
  ['John Williams', '约翰·威廉姆斯'],
  ['John Powell', '约翰·鲍威尔'],
  ['Elton John', '埃尔顿·约翰'],
  ['Alan Menken', '艾伦·门肯'],
  ['John Lennon', '约翰·列侬'],
  ['Billy Joel', '比利·乔尔'],
  ['Adele', '阿黛尔'],
  ['Masayoshi Soken', '祖坚正庆'],
  ['Keiichi Okabe', '冈部启一'],
  ['Shoji Meguro', '目黑将司'],
  ['Jay Chou', '周杰伦'],
  ['Edward MacDowell', '麦克道威尔'],
  ['Camille Saint-Saëns', '圣桑'],
  ['Franz Behr', '贝尔'],
  ['Franz Gruber', '格鲁伯'],
  ['Henry Purcell', '珀塞尔'],
  ['Georg Philipp Telemann', '泰勒曼'],
  ['Georges Bizet', '比才'],
  ['Alexander Borodin', '鲍罗丁'],
  ['Gabriel Fauré', '福雷'],
  ['Edward Elgar', '埃尔加'],
  ['Carl Maria von Weber', '韦伯'],
  ['Domenico Cimarosa', '奇马罗萨'],
  ['Ludwig Minkus', '明库斯'],
])

/** 作曲家的中文名，没有收录时返回空串。 */
export function composerZh(raw: string): string {
  return CHINESE.get(composerName(raw)) ?? ''
}
