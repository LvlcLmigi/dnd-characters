/* =====================================================================
   YOUR CHARACTERS — this is the only file you need to edit.

   To add a character: copy one { ... } block, paste it after the last
   one (keep the comma between blocks), and change the values.

   IMAGES (put files in images/characters and images/backgrounds)
   - art:              the character, as a PNG with a TRANSPARENT background
                       (cut out). Crop tight; tall images look best.
   - background_image: optional scene behind them on their page (JPG/PNG).
   - color:            their signature colour — used for their card and
                       their whole page. Go bright and saturated.
   Until art is added, the character's initials stand in for it.

   Any field you leave out (or set to "") simply doesn't show.
   ===================================================================== */

const CAMPAIGN = {
  title: "The Party",
  subtitle: "A campaign in progress",
  intro: "Heroes, rogues and at least one menace. Pick a character to learn who they are.",
};

const CHARACTERS = [
  {
    id: "seraphine",                 // used in the link: dnd.volbeat.vip/#seraphine
    name: "Seraphine Vael",
    epithet: "The Unquiet Mind",
    player: "Alex",
    color: "#d8274d",                // signature colour

    race: "Tiefling",
    subrace: "Infernal Legacy (Zariel)",
    class: "Sorcerer",
    subclass: "Aberrant Mind",
    multiclass: "",                  // e.g. "Warlock 2 (The Great Old One)"
    level: 7,
    background: "Sage",
    alignment: "Chaotic Good",
    deity: "",
    age: "24",
    height: "5'8\"",
    pronouns: "she/her",
    status: "Alive",                 // Alive, Dead, Missing, Retired...

    stats: { STR: 8, DEX: 14, CON: 14, INT: 12, WIS: 10, CHA: 18 },

    quote: "The voices aren't wrong. They're just rude.",
    bio: [
      "Raised in the scriptorium of a mountain monastery, Seraphine spent her childhood copying texts no one else would touch. One of them touched her back.",
      "Now she hears thoughts that aren't hers, and occasionally answers them out loud. She travels with the party in search of the book that changed her, and a way to close what it opened.",
    ],
    traits: ["Speaks to her own shadow", "Collects pressed flowers", "Terrified of deep water"],
    goals: "Find the Codex Umbral before the Cult of the Eye does.",

    art: "",                         // e.g. "images/characters/name.png"
    background_image: "",            // e.g. "images/backgrounds/name.jpg"
  },
  {
    id: "brokk",
    name: "Brokk Emberhelm",
    epithet: "Shield of the Hold",
    player: "Jordan",
    color: "#e0611a",

    race: "Dwarf",
    subrace: "Mountain Dwarf",
    class: "Fighter",
    subclass: "Battle Master",
    level: 7,
    background: "Soldier",
    alignment: "Lawful Neutral",
    deity: "Moradin",
    age: "112",
    height: "4'6\"",
    pronouns: "he/him",
    status: "Alive",

    stats: { STR: 18, DEX: 10, CON: 16, INT: 10, WIS: 12, CHA: 9 },

    quote: "Stand behind me. No — further.",
    bio: [
      "Last surviving sergeant of the Ironvein Guard, Brokk carries the clan's banner wrapped around the haft of his axe.",
      "He keeps a ledger of every debt owed to him and every debt he owes. The second list is longer, and he intends to pay it all.",
    ],
    traits: ["Hums marching songs", "Judges people by their boots", "Secretly loves poetry"],
    goals: "Retake the halls of Ironvein.",

    art: "",                         // e.g. "images/characters/name.png"
    background_image: "",            // e.g. "images/backgrounds/name.jpg"
  },
  {
    id: "liriel",
    name: "Liriel Thornwhisper",
    epithet: "Who Walks Unseen",
    player: "Sam",
    color: "#1fa463",

    race: "Elf",
    subrace: "Wood Elf",
    class: "Ranger",
    subclass: "Gloom Stalker",
    level: 6,
    background: "Outlander",
    alignment: "Neutral Good",
    deity: "",
    age: "141",
    height: "5'5\"",
    pronouns: "they/them",
    status: "Alive",

    stats: { STR: 10, DEX: 18, CON: 12, INT: 11, WIS: 16, CHA: 10 },

    quote: "The forest remembers. So do I.",
    bio: [
      "Liriel was a warden of the Greywood until the trees started dying from the roots up.",
      "They followed the rot out of the forest and straight into the party's campfire, and haven't quite figured out how to leave.",
    ],
    traits: ["Never sits with their back to a door", "Names every horse 'Horse'", "Can't cook"],
    goals: "Find the source of the blight.",

    art: "",                         // e.g. "images/characters/name.png"
    background_image: "",            // e.g. "images/backgrounds/name.jpg"
  },
];
