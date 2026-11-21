"""Generate an original, platform-safe temporary roster and deterministic SVG portraits."""
import random, re, json, html
from pathlib import Path
from math import sin
ROOT = Path(__file__).resolve().parents[1]
R = random.Random(20261122)
REALMS = ['Ember Dominion','Astral Covenant','Iron Wastes','Verdant Court','Tidebound Republic','Obsidian Order','Skyward Nomads','Hollow Realms','Glass Citadel','Thunder Pact','Lunar Archive','Crimson Frontier']
FIRST = ['Kael','Seris','Varya','Orin','Elara','Thane','Lyra','Cassian','Mira','Darian','Neris','Sable','Eryn','Talos','Astra','Cyrin','Fenna','Riven','Ysra','Dessa','Oren','Vale','Vesper','Juno','Tarin','Nyxen','Keira','Lucen','Rheia','Corin','Avel','Morrow','Sylas','Tessa','Rowan','Aeris','Bren','Idra','Liora','Evren','Zeran','Arden','Selene','Bastian','Calyx','Osha','Veyra','Noel','Maera','Ziven','Halen','Rysa','Nolan','Kova','Aris']
LAST = ['Veylan','Thorn','Solenne','Dusk','Sorn','Ashcroft','Voss','Merrin','Vael','Mire','Kestrel','Hearth','Mori','Kane','Ardent','Silvers','Cairn','Draven','Korr','Seraph','Hollow','Aster','Rook','Halcyon','Valehart','Raine','Briar','Orris','Sable','Sund','Vire','Wren','Pell','Morrow','Lorien','Dawn','Auren','Halden','Corven','Nox']
ARCHETYPES = [
  ('Vanguard',[93,70,82,90,31,67]),('Duelist',[79,96,89,74,56,74]),
  ('Oracle',[38,61,86,56,95,98]),('Sentinel',[87,65,91,97,46,77]),
  ('Arcanist',[46,74,87,60,98,92]),('Strider',[69,97,88,72,47,80]),
  ('Tactician',[62,76,98,71,68,94]),('Warden',[90,63,89,95,70,72]),
  ('Artificer',[56,78,82,68,88,97]),('Shadewalker',[74,94,93,69,90,86])
]
PALETTES = [('#683a4e','#e7a3b5','#30233d'),('#415a69','#b0cbd1','#29283d'),('#6c4941','#efb492','#3b2c36'),('#36584d','#a2cdb7','#2b293b'),('#584b77','#c6b1e4','#2e253d'),('#665044','#e2c5a4','#392a32'),('#5a5169','#b9aacd','#2a283a'),('#493d66','#a9a0d4','#2b2337'),('#4a5a61','#b8cfce','#2b2939'),('#6c4658','#dea4c1','#39263d'),('#5b5479','#c5bbe6','#2a293d'),('#733f51','#e5a7aa','#322239')]
SKINS=['#d8a17f','#b97f68','#eac8a7','#a26951','#dcb498','#f1c9ae','#c18b74','#8e5c4a']
HAIRS=['#2d2431','#513a41','#eee0cf','#665a68','#a77968','#34344a','#b89575','#77566d','#271f32']

def slug(s):return re.sub('[^a-z0-9]+','-',s.lower()).strip('-')
def portrait(row, index, archetype, realm):
  name=row['name'];bg,accent,shadow=PALETTES[realm]
  skin=SKINS[index%len(SKINS)];hair=HAIRS[(index*5)%len(HAIRS)];eye=HAIRS[(index*7+3)%len(HAIRS)]
  code=index%7
  crown = '<path d="M172 245 191 212 230 245 256 208 285 245 324 212 343 245 329 268 180 268Z" fill="'+accent+'" opacity=".90"/>' if code==0 else ''
  hood = '<path d="M116 326 Q102 130 256 120 Q413 142 398 331 L353 271 Q331 177 256 166 Q172 175 158 276Z" fill="'+shadow+'"/>' if code in (1,5) else ''
  sidehair = '<path d="M167 252 Q151 346 140 434 L169 422 189 335 M350 251 Q370 348 375 433 L343 417 326 322Z" fill="'+hair+'"/>' if code in (2,4) else ''
  crest = '<path d="M240 575 256 535 272 575 256 606Z" fill="'+accent+'"/><path d="M226 584H286" stroke="#fff" opacity=".65" stroke-width="3"/>'
  svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768"><defs><linearGradient id="bg" x2="0.8" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="{shadow}"/></linearGradient><linearGradient id="body" x2=".7" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="#1e1b2c"/></linearGradient><radialGradient id="halo"><stop stop-color="{accent}" stop-opacity=".45"/><stop offset="1" stop-color="{accent}" stop-opacity="0"/></radialGradient></defs><rect width="512" height="768" fill="url(#bg)"/><circle cx="265" cy="301" r="248" fill="url(#halo)"/><g fill="none" stroke="{accent}" opacity=".33"><circle cx="256" cy="314" r="186" stroke-width="2"/><circle cx="256" cy="314" r="218" stroke-width="1"/><path d="M38 525 474 525M67 72 445 72"/></g><path d="M0 736 Q48 530 159 508 Q190 498 209 470 L303 470 Q325 500 352 510 Q472 544 512 735V768H0Z" fill="#1d1a2c"/><path d="M24 768 Q79 548 188 528 L256 603 327 529 Q435 559 488 768Z" fill="url(#body)" stroke="{accent}" stroke-opacity=".25" stroke-width="5"/><path d="M189 520 256 580 323 520 309 488 201 488Z" fill="{skin}"/><path d="M157 278 Q152 167 255 148 Q357 166 353 283 L342 402 Q312 459 255 469 Q190 452 169 402Z" fill="{skin}"/><path d="M152 305 Q108 191 176 164 Q249 109 328 162 Q386 194 354 309 Q344 262 335 232 Q286 230 260 207 Q213 239 168 234Z" fill="{hair}"/>{hood}{sidehair}{crown}<path d="M187 328 Q213 318 238 326 M275 326 Q303 320 329 327" fill="none" stroke="{eye}" stroke-width="6" stroke-linecap="round"/><ellipse cx="218" cy="335" rx="7" ry="9" fill="{eye}"/><ellipse cx="294" cy="335" rx="7" ry="9" fill="{eye}"/><path d="M255 346 Q247 379 261 381" fill="none" stroke="#754e48" stroke-width="3" opacity=".65"/><path d="M227 409 Q256 421 287 407" stroke="#744e50" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M187 521 256 590 324 520" fill="none" stroke="{accent}" stroke-width="10"/><path d="M173 535 99 610 116 768 M336 535 411 610 393 768" fill="none" stroke="{accent}" opacity=".42" stroke-width="5"/>{crest}<path d="M0 0H512V768H0Z" fill="none" stroke="{accent}" stroke-width="14" opacity=".35"/><g fill="{accent}" opacity=".48"><circle cx="44" cy="50" r="5"/><circle cx="468" cy="50" r="5"/></g></svg>'''
  (ROOT/'public/assets/portraits'/f'{row["id"]}.svg').write_text(svg)

used=set();rows=[]
for i in range(101):
  while True:
    name=R.choice(FIRST)+' '+R.choice(LAST)
    if name not in used:break
  used.add(name)
  universe=REALMS[i%12]
  archetype,base=ARCHETYPES[(i//12+i*3)%len(ARCHETYPES)]
  scores=[max(8,min(99,x+R.randint(-10,10))) for x in base]
  code=slug(name)
  row=dict(id=code,name=name,universe=universe,portrait_url='/assets/portraits/'+code+'.svg',strength=scores[0],dexterity=scores[1],battle_iq=scores[2],endurance=scores[3],hacks=scores[4],iq=scores[5])
  rows.append(row);portrait(row,i,archetype,i%12)
assert len(set(row['name'] for row in rows))==101
(ROOT/'src/data/characters.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n')
head='''CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);\nCREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);\nCREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, universe TEXT NOT NULL, portrait_url TEXT NOT NULL DEFAULT '', strength INTEGER NOT NULL, dexterity INTEGER NOT NULL, battle_iq INTEGER NOT NULL, endurance INTEGER NOT NULL, hacks INTEGER NOT NULL, iq INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);\nCREATE TABLE IF NOT EXISTS daily_drafts (user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL, current_character_id TEXT REFERENCES characters(id), submitted_at TEXT, created_at TEXT NOT NULL, PRIMARY KEY(user_id,day));\nCREATE TABLE IF NOT EXISTS daily_picks (user_id TEXT NOT NULL, day TEXT NOT NULL, stat TEXT NOT NULL CHECK(stat IN ('strength','dexterity','battle_iq','endurance','hacks','iq')), character_id TEXT NOT NULL REFERENCES characters(id), PRIMARY KEY(user_id,day,stat), UNIQUE(user_id,day,character_id));\nCREATE TABLE IF NOT EXISTS stat_matchups (id TEXT PRIMARY KEY, day TEXT NOT NULL, p1 TEXT NOT NULL, p2 TEXT NOT NULL, stat TEXT NOT NULL, p1_character TEXT NOT NULL, p2_character TEXT NOT NULL, p1_value INTEGER NOT NULL, p2_value INTEGER NOT NULL, winner_id TEXT, settled_at TEXT NOT NULL);\nCREATE INDEX IF NOT EXISTS idx_matchup_day ON stat_matchups(day);\nCREATE INDEX IF NOT EXISTS idx_matchup_winner ON stat_matchups(winner_id,day);\nCREATE TABLE IF NOT EXISTS settlements (day TEXT PRIMARY KEY, settled_at TEXT NOT NULL, player_count INTEGER NOT NULL, matchup_count INTEGER NOT NULL);\nCREATE TABLE IF NOT EXISTS auth_attempts (ip TEXT NOT NULL, operation TEXT NOT NULL, at TEXT NOT NULL);\nCREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(ip,operation,at);\n'''
for row in rows:
 cols=list(row);vals=[row[c] for c in cols];safe=','.join("'"+v.replace("'","''")+"'" if isinstance(v,str) else str(v) for v in vals)
 head+=f"INSERT OR IGNORE INTO characters ({','.join(cols)}) VALUES ({safe});\n"
(ROOT/'migrations/0002_game.sql').write_text(head)
print('generated',len(rows),'original characters across',len(REALMS),'realms')
