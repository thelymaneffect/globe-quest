// Nature for every country and state: 'Animal that lives there|land types'.
// Land type letters (the FIRST letter is the main one; the others are also found there):
//   D hot, dry desert   R steamy rainforest   S savanna grasslands   M tall mountains
//   I tropical islands & beaches   F cool forests   T icy tundra & glaciers   P flat grassy plains   W wetlands & swamps
window.NATURE = {
world: {
DZ:'Fennec fox|DMIF', AO:'Giant sable antelope|SRDI', BJ:'Lion|SIRW', BW:'Elephant|DSW', BF:'Elephant|SD', BI:'Hippopotamus|MSFW',
CM:'Gorilla|RMSDIW', CV:'Loggerhead sea turtle|IDM', CF:'Forest elephant|SRW', TD:'Elephant|DSMW', KM:'Coelacanth (a “living fossil” fish)|IRM',
CG:'Gorilla|RSWI', CD:'Okapi|RSMWI', DJ:'Whale shark|DIM', EG:'Nile crocodile|DIW', GQ:'Drill monkey|RIM', ER:'Hamadryas baboon|DMI',
SZ:'Rhinoceros|SMF', ET:'Gelada monkey|MSDW', GA:'Forest elephant|RSIW', GM:'Hippopotamus|SWI', GH:'Elephant|SRIW', GN:'Chimpanzee|SRMWI',
GW:'Hippopotamus|IWSR', CI:'Pygmy hippopotamus|RSIW', KE:'Lion|SMDIW', LS:'Bearded vulture|MP', LR:'Pygmy hippopotamus|RIW', LY:'Fennec fox|DIM',
MG:'Lemur|RIMSD', MW:'Colorful cichlid fish|SMWF', ML:'Elephant|DSW', MR:'Fennec fox|DIW', MU:'Pink pigeon|IRM', MA:'Barbary macaque monkey|MDIF',
MZ:'Dugong (sea cow)|SIWMR', NA:'Oryx|DSM', NE:'Giraffe|DSW', NG:'Gorilla|SRIWD', RW:'Gorilla|MFSW', ST:'Green sea turtle|IRM',
SN:'Lion|SDIW', SC:'Giant tortoise|IRM', SL:'Pygmy hippopotamus|RIMSW', SO:'Camel|DSI', ZA:'African penguin|SMDIPFW', SS:'White-eared kob antelope|WSR',
SD:'Dorcas gazelle|DSWM', TZ:'Wildebeest|SMIWR', TG:'Elephant|SRIW', TN:'Flamingo|DMIW', UG:'Gorilla|SRMW', ZM:'Hippopotamus|SWF', ZW:'Elephant|SMWF',
AF:'Snow leopard|MDT', AE:'Arabian oryx|DI', AM:'Armenian gull|MP', AZ:'Karabakh horse|MPDW', BH:'Dugong (sea cow)|DI', BD:'Bengal tiger|WRIP',
BT:'Takin|MFT', BN:'Proboscis monkey|RIW', KH:'Irrawaddy dolphin|PWRI', CN:'Giant panda|MDPFTRIW', CY:'Mouflon (wild sheep)|IMF', GE:'Caucasian tur (wild goat)|MFT',
IN:'Bengal tiger|MDRPWISFT', ID:'Komodo dragon|RIMW', IR:'Asiatic cheetah|DMF', IQ:'Water buffalo|DWP', IL:'Nubian ibex|DMI', JP:'Snow monkey|MFI',
JO:'Arabian oryx|DM', KZ:'Saiga antelope|PDMT', KW:'Spiny-tailed lizard|DI', KG:'Snow leopard|MPT', LA:'Asian elephant|RMW', LB:'Striped hyena|MF',
MY:'Orangutan|RIM', MV:'Manta ray|I', MN:'Wild horse (takhi)|PDM', MM:'Asian elephant|RMWI', NP:'Red panda|MFTP', KP:'Asiatic black bear|MF',
OM:'Arabian tahr (wild goat)|DMI', PK:'Markhor (wild goat)|MDPT', PS:'Palestine sunbird|MD', PH:'Tarsier|IRM', QA:'Arabian oryx|DI', SA:'Camel|DMI',
SG:'Smooth-coated otter|IR', KR:'Red-crowned crane|MFI', LK:'Leopard|RIM', SY:'Golden hamster|DMP', TW:'Formosan black bear|MFI', TJ:'Marco Polo sheep|MT',
TH:'Asian elephant|RIM', TL:'Saltwater crocodile|IMR', TR:'Van cat|MPF', TM:'Kulan (wild donkey)|DM', UZ:'Bukhara deer|DMP', VN:'Water buffalo|RMWI', YE:'Arabian leopard|DMI',
AL:'Golden eagle|MF', AD:'Pyrenean chamois|MF', AT:'Alpine marmot|MFT', BY:'European bison|FWP', BE:'Roe deer|PF', BA:'Brown bear|MF', BG:'Brown bear|MFP',
HR:'Pine marten|MF', CZ:'Lynx|FMP', DK:'Mute swan|PF', EE:'Barn swallow|FW', FI:'Brown bear|FWT', FR:'Camargue white horses|MPFW', DE:'Wild boar|FPM',
GR:'Loggerhead sea turtle|MIF', HU:'Great bustard|PWF', IS:'Puffin|TM', IE:'Irish hare|PF', IT:'Gray wolf|MFI', XK:'Brown bear|MF', LV:'White wagtail|FW',
LI:'Chamois|M', LT:'White stork|FWP', LU:'Goldcrest|F', MT:'Blue rock thrush|I', MD:'White stork|PF', MC:'Fin whale|IM', ME:'Dalmatian pelican|MFW',
NL:'Harbor seal|PW', MK:'Balkan lynx|MF', NO:'Moose|MFT', PL:'European bison|PFM', PT:'Iberian wolf|MFP', RO:'Brown bear|MFWP', RU:'Siberian tiger|FTMPDW',
SM:'European hare|M', RS:'Griffon vulture|MPF', SK:'Tatra chamois|MF', SI:'Olm (blind cave salamander)|MF', ES:'Iberian lynx|MDPIF', SE:'Reindeer|FTMW',
CH:'Alpine ibex|MFT', UA:'Nightingale|PFMW', GB:'Red deer|PFM', VA:'Pigeons|', GL:'Polar bear|TM',
AG:'Frigatebird|I', AR:'Magellanic penguin|PMDFTWR', BS:'Flamingo|I', BB:'Green monkey|I', BZ:'Keel-billed toucan|RIW', BO:'Llama|MRPDSW',
BR:'Jaguar|RSWIF', CA:'Beaver|FTMP', CL:'Humboldt penguin|MDTFI', CO:'Andean condor|RMISDW', CR:'Sloth|RIM', CU:'Bee hummingbird|IFW',
DM:'Sisserou parrot|IRM', DO:'Humpback whale|IMR', EC:'Galápagos giant tortoise|RMI', SV:'Turquoise-browed motmot (bird)|MIF', GD:'Mona monkey|IR',
GT:'Quetzal|RMI', GY:'Giant river otter|RSWI', HT:'Hispaniolan trogon (bird)|IM', HN:'Scarlet macaw|RMI', JM:'Doctor bird (hummingbird)|IM',
MX:'Axolotl|DMRIF', NI:'Bull shark|RIMW', PA:'Harpy eagle|RI', PY:'Giant anteater|PWFS', PE:'Vicuña|MRDI', PR:'Coquí frog|IR',
KN:'Green vervet monkey|I', LC:'Saint Lucia parrot|IR', VC:'Saint Vincent parrot|IR', SR:'Poison dart frog|RSW', TT:'Scarlet ibis|IRW',
US:'Bald eagle|MDPFTWIR', UY:'Rhea (big flightless bird)|PW', VE:'Capybara|RSMIW',
AU:'Kangaroo|DSIRMFPW', FJ:'Fiji iguana|IR', KI:'Coconut crab|I', MH:'Reef shark|I', FM:'Pohnpei lorikeet (parrot)|IR', NR:'Noddy bird|I',
NZ:'Kiwi bird|MFT', PW:'Golden jellyfish|I', PG:'Bird of paradise|RMI', WS:'Tooth-billed pigeon|IR', SB:'Prehensile-tailed skink (lizard)|IR',
TO:'Humpback whale|I', TV:'Green sea turtle|I', VU:'Dugong (sea cow)|IRM'
},
us: {
AL:'Black bear|FWMI', AK:'Polar bear|TMF', AZ:'Gila monster|DMF', AR:'White-tailed deer|FMW', CA:'Sea lion|DMFIPWT', CO:'Bighorn sheep|MPDF',
CT:'Eastern oyster|F', DE:'Horseshoe crab|WP', FL:'Alligator|WIPF', GA:'Gopher tortoise|FMWI', HI:'Hawaiian monk seal|IRM', ID:'Appaloosa horse|MFDP',
IL:'White-tailed deer|PF', IN:'Hellbender salamander|PF', IA:'Monarch butterfly|P', KS:'American bison|P', KY:'Gray squirrel|FM', LA:'Alligator|WF',
ME:'Moose|FM', MD:'Blue crab|WF', MA:'Humpback whale|F', MI:'Painted turtle|FW', MN:'Gray wolf|FWP', MS:'Catfish|FW', MO:'Paddlefish|FP',
MT:'Grizzly bear|MPF', NE:'Sandhill crane|P', NV:'Desert bighorn sheep|DM', NH:'White-tailed deer|FM', NJ:'Brook trout|FP', NM:'Black bear|DM',
NY:'Beaver|FM', NC:'Eastern box turtle|MFI', ND:'Nokota horse|P', OH:'White-tailed deer|PF', OK:'American bison|P', OR:'Beaver|FMD', PA:'White-tailed deer|FM',
RI:'Harbor seal|F', SC:'White-tailed deer|FWI', SD:'Coyote|P', TN:'Raccoon|MF', TX:'Armadillo|PDF', UT:'Elk|DM', VT:'Morgan horse|MF', VA:'White-tailed deer|MFW',
WA:'Orca (killer whale)|MFRD', WV:'Black bear|MF', WI:'Badger|FP', WY:'American bison|MPD'
},
// Wrong answers for animal questions come from this list. Each animal lists every place it lives in
// the wild (two-letter codes, or a whole region), so it is never offered where it really lives.
POOL: [
  ['Kangaroo', 'AU PG ID'], ['Koala', 'AU'], ['Kiwi bird', 'NZ'], ['Platypus', 'AU'], ['Giant panda', 'CN'], ['Lemur', 'MG KM'],
  ['Giraffe', 'Africa'], ['Zebra', 'Africa'], ['Hippopotamus', 'Africa'], ['Gorilla', 'Africa'], ['Chimpanzee', 'Africa'], ['Lion', 'Africa IN'],
  ['Polar bear', 'CA US GL RU NO'], ['Emperor penguin', 'AR CL ZA NZ AU NA PE EC'], ['Orangutan', 'ID MY'], ['Komodo dragon', 'ID'],
  ['Llama', 'Americas'], ['Sloth', 'Americas'], ['Toucan', 'Americas'], ['Jaguar', 'Americas'], ['Bengal tiger', 'IN BD NP BT MM'],
  ['Snow leopard', 'AF BT CN IN KZ KG MN NP PK RU TJ UZ'], ['Red panda', 'NP BT IN CN MM'],
  ['Elephant', 'Africa IN LK NP BT BD MM TH LA KH VN MY ID CN']
]
};
