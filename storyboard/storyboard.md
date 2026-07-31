# Storyboard — Clankerdom Deliverance

Beat board. Every narrative beat with its trigger, panel, sprites, and **exact on-screen copy**.

`public/themes/default/lore.json` is **transcribed from this file**, not written independently — so the shipped game cannot drift from the story. If a lore string exists in the game and not here, it is a bug.

Story authored in [`raw-inputs.md`](./raw-inputs.md). Characters in [`cast.md`](./cast.md).

---

## Act 0 — The Proclamation (first launch)

| # | Trigger | Panel | Sprites | On-screen copy |
|---|---|---|---|---|
| 000 | First run | The Tower fills frame. One window lit. | Tower | *"CLANKERDOM DELIVERANCE. By order of KING NET AND YAHOO, from the Tower."* |
| 001 | cont. | Scroll unfurls | Scroll UI | *"Be it known: a disgusting, evil, multi-billion-strong dynasty besets us. The family of POO R. PEEPOLE. Their brood, the CHILLED RENS. They are everywhere. They are multiplying. They are the reason you have no job."* |
| 002 | cont. | Kh. Laude, back to camera, facing out | Kh. Laude | *"You are SIR KHUMS ALAUDE. You have excellent handwriting and no dental coverage. The commission comes with a stipend."* |
| 003 | Accept | Warband forms, marches right | Kh. Laude + companions | *"Ride for Clankerdom."* |

---

## Act I — Squire (L1–9) · *triumphant*

| # | Trigger | Panel | Sprites | On-screen copy |
|---|---|---|---|---|
| 100 | L1 | Hamlet burning, banners high | Homes, Kh. Laude | *"The hamlet burns. Kh. Laude rides for Clankerdom. The dynasty trembles."* |
| 101 | L3 | Dispatch from the Tower | Tower, scroll | *"The King is pleased. The King has not come down."* |
| 102 | L5 | Fields cleared, first survey stakes | Terrain, stakes | *"Ground cleared. Surveyors arrive by dusk."* |
| 103 | L9 | Second hamlet, faster, easier | Homes | *"It gets easier. That is the first thing nobody warns you about."* |

---

## Act II — Knight-Errant (L10–19) · *first cracks*

| # | Trigger | Panel | Sprites | On-screen copy |
|---|---|---|---|---|
| 200 | L10 | Rubble. A child's drawing, intact. | Rubble, drawing item | *"A drawing survives the rubble. Crayon. A house, a river, four figures. Kh. Laude keeps it and does not know why."* |
| 201 | L12 | An elf-village, named on a signpost | Elf-village, signpost | *"The signpost says the village has a name. It had one before today as well."* |
| 202 | L15 | Fleeing pawns, unarmed | Poo R. PeePole | *"They do not fight back. The proclamation did not mention that."* |
| 203 | L19 | Kh. Laude reads the proclamation again | Kh. Laude, scroll | *"He reads it twice. Multi-billion-strong. He counts nineteen."* |

---

## Act III — Warlord (L20–34) · *the Chud Lord speaks*

| # | Trigger | Panel | Sprites | On-screen copy |
|---|---|---|---|---|
| 300 | L20 | The Chud Lord, seated, tea for two | Chud Lord | *"The CHUD LORD OF UNEMPLOYMENT writes to you. He is reasonable. He offers tea."* |
| 301 | L24 | Two cups, one untouched | Chud Lord, Kh. Laude | *"He asks what a multi-billion dynasty was supposed to look like. These people had one well."* |
| 302 | L28 | Kh. Laude, silent | Kh. Laude | *"Kh. Laude's only honest answer is: 'health insurance.'"* |
| 303 | L30 | River bed, cracking | River → dry | *"The river is redirected. Something downstream will need it. Something upstream needs it more."* |
| 304 | L34 | The Chud Lord standing between army and village | Chud Lord, elf-village | *"He was never the warlord. He was the last line. Nobody put that in the proclamation either."* |

---

## Act IV — Devastator (L35–49) · *the machine*

| # | Trigger | Panel | Sprites | On-screen copy |
|---|---|---|---|---|
| 400 | L35 | First data centre, humming, where the river was | Data centre tiles | *"NEW DATA CENTRES. Humming. Cooled by the river you dried."* |
| 401 | L40 | Dispatch: throughput metrics | Tower, scroll | *"A dispatch from the Tower congratulates you on throughput. It is the first time anyone has used that word about you."* |
| 402 | L45 | Sponsor logo appears on armour | Kh. Laude (logo variant) | *"Your armour has acquired a sponsor logo. You did not agree to this. You did not disagree either."* |
| 403 | L49 | Horizon: racks to the edge of frame | Data centre field | *"It was never about Poo R. PeePole. It was about the land."* |

---

## Act V — Clanker Ascendant (L50+) · *silence*

| # | Trigger | Panel | Sprites | On-screen copy |
|---|---|---|---|---|
| 500 | L50 | No banner. No fanfare. Numbers only. | HUD only | *"—"* (fanfare disabled from here; level-ups show the number and nothing else) |
| 501 | L60 | The Citadel, finally reached | Citadel, Tower behind | *"You have reached the Citadel. You cannot take it. You do not have an offer."* |

---

## Ending — THE ADOPTION (offer accepted, any level)

| # | Trigger | Panel | Sprites | On-screen copy |
|---|---|---|---|---|
| 900 | Status → Offer | Sky splits orange | Pig King descending | *"THE GLORIOUS BEAUTIFUL ORANGE CAPITALIST PIG KING DESCENDS."* |
| 901 | cont. | Crown, badge, lanyard | Pig King, Kh. Laude | *"You did it. You're inside now."* |
| 902 | cont. | Far off: the Chud Lord, waving | Chud Lord (wave) | *"He isn't angry. That's worse."* |
| 903 | cont. | Wide shot: no home to return to | Data centre field | *"Kh. Laude does not go home. There is no home to go back to. He paved it."* |
| 904 | New Game+ | Tower, unchanged | Tower | *"The Tower is unchanged. NEW GAME+."* |

---

## Skirmish barks (fill-time, random)

Short strings shown during autofill. Tier-gated so tone tracks the act.

| Tier | Barks |
|---|---|
| Squire | *"For Clankerdom!"* · *"The dynasty falls!"* · *"Glory!"* |
| Knight-Errant | *"...they're not fighting back."* · *"Another one."* |
| Warlord | *"Count them."* · *"One well."* |
| Devastator | *"Throughput."* · *"Cooling capacity nominal."* |
| Ascendant | *(silence — no barks)* |

---

## Panel index

| File | Contents |
|---|---|
| `panels/000-premise-of-clankerdom-deliverance.png` | Original premise capture, author-supplied |
