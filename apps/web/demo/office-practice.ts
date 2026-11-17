import { DEFAULT_AVATAR, type AvatarConfig, type PowerId } from "@inbox/shared";
import { PracticeMatch } from "../src/office/practice";

/**
 * Standalone build of the offline practice, for trying the fight without the server:
 * node apps/web/demo/build-office-demo.mjs writes a single HTML file.
 */
const presets: { name: string; avatar: AvatarConfig }[] = [
  {
    name: "Hernan",
    avatar: {
      skin: 1,
      hairColor: 0,
      equipped: {
        ...DEFAULT_AVATAR.equipped,
        hair: "hair_mohawk",
        beard: "beard_stubble",
        outfit: "outfit_iron",
        weapon: "weapon_sword",
        cape: "cape_red",
        pet: "pet_cat",
      },
    },
  },
  {
    name: "Hernan",
    avatar: {
      skin: 0,
      hairColor: 3,
      equipped: {
        head: "head_elf",
        eyes: "eyes_glow",
        hair: "hair_long",
        outfit: "outfit_mage",
        headgear: "headgear_wizard",
        weapon: "weapon_staff",
        wings: "wings_angel",
        effect: "effect_sparkles",
      },
    },
  },
  {
    name: "Hernan",
    avatar: {
      skin: 2,
      hairColor: 4,
      equipped: {
        head: "head_orc",
        eyes: "eyes_sharp",
        hair: "hair_flame",
        beard: "beard_viking",
        outfit: "outfit_sweater",
        headgear: "headgear_viking",
        weapon: "weapon_stapler",
        pet: "pet_dragon_green",
      },
    },
  },
];
const rivals = [
  {
    name: "Gerente Dragón",
    avatar: {
      skin: 0,
      hairColor: 0,
      equipped: {
        head: "head_dragon",
        eyes: "eyes_glow",
        outfit: "outfit_gold",
        headgear: "headgear_crown",
        cape: "cape_royal",
        weapon: "weapon_mug",
        pet: "pet_dragon_red",
        effect: "effect_fire",
      },
    } as AvatarConfig,
  },
  {
    name: "Contadora Elfa",
    avatar: {
      skin: 0,
      hairColor: 2,
      equipped: {
        head: "head_elf",
        hair: "hair_long",
        outfit: "outfit_mage",
        weapon: "weapon_staff",
      },
    } as AvatarConfig,
  },
  {
    name: "Orco de Logística",
    avatar: {
      skin: 2,
      hairColor: 0,
      equipped: {
        head: "head_orc",
        outfit: "outfit_sweater",
        weapon: "weapon_mug",
      },
    } as AvatarConfig,
  },
];

const stage = document.getElementById("stage")!;
const menu = document.getElementById("menu")!;
let pick = 0;
let match: PracticeMatch | null = null;

function start() {
  match?.dispose();
  stage.innerHTML = "";
  menu.hidden = true;
  match = new PracticeMatch(stage, {
    me: {
      ...presets[pick]!,
      powers: (
        document.getElementById("powers") as HTMLSelectElement
      ).value.split(",") as PowerId[],
    },
    rivals: rivals.slice(
      0,
      Number((document.getElementById("bots") as HTMLSelectElement).value),
    ),
    skill: Number(
      (document.getElementById("skill") as HTMLSelectElement).value,
    ),
    onEnd: () => setTimeout(() => (menu.hidden = false), 1800),
  });
  (document.getElementById("play") as HTMLButtonElement).textContent =
    "Revancha";
}

document.getElementById("play")!.addEventListener("click", start);
document.getElementById("look")!.addEventListener("click", () => {
  pick = (pick + 1) % presets.length;
  start();
});
