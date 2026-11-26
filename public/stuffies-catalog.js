/* Hosted reference catalog; no original room photos. */
export const HOSTED_VERSION=1;
export const HOSTED_STUFFIES=[
  {
    "id": "stuffy-hosted-turtwig",
    "key": "turtwig",
    "cardId": "001",
    "name": "Turtwig",
    "aliases": [
      "turtwig",
      "turtlewig",
      "turtle wig"
    ],
    "views": [
      "turtwig-front",
      "turtwig-side"
    ]
  },
  {
    "id": "stuffy-hosted-pikachu",
    "key": "pikachu",
    "cardId": "025",
    "name": "Pikachu",
    "aliases": [
      "pikachu",
      "peekachu",
      "pikachoo"
    ],
    "views": [
      "pikachu-front",
      "pikachu-back"
    ]
  },
  {
    "id": "stuffy-hosted-charmander",
    "key": "charmander",
    "cardId": "004",
    "name": "Charmander",
    "aliases": [
      "charmander",
      "charmandar"
    ],
    "views": [
      "charmander-front",
      "charmander-side"
    ]
  },
  {
  "id": "stuffy-hosted-chimchar",
  "key": "chimchar",
  "name": "Chimchar",
  "aliases": [
    "chimchar",
    "chimchari",
    "chimari"
  ],
  "views": [],
  "bonusCard": {
    "name": "ChimchAri",
    "number": "BONUS • 001",
    "src": "assets/stuffies/chimchari-card.svg"
  }
}
];
export function hostedIdentity(r,seed) {
 const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
 return r.id===seed.id||r.hostedKey===seed.key||seed.aliases.some(n=>norm(n)===norm(r.name));
}
export function nextCatch(item,at) {
 if(!item)return null;
 const wasNew=!item.claimed;
 return {record:{...item,claimed:true,claimedAt:item.claimedAt||at,lastCaughtAt:at,catchCount:Math.max(item.claimed?1:0,Number(item.catchCount)||0)+1},wasNew};
}

export function resolveOfficialStuffyCard(record,cards,seeds,identity){
 if(!record)return null;
 const seed=seeds.find(s=>identity(record,s));
 const cardId=record.cardId||seed?.cardId;
 const card=cardId&&cards.find(c=>String(c.id).padStart(3,'0')===String(cardId).padStart(3,'0')&&c.src);
 if(card)return {id:record.id,name:card.name,src:card.src,number:card.number||card.id,modelKey:record.hostedKey||seed?.key,arimonCardId:card.id,stuffyName:record.name};
 if(seed?.bonusCard)return {id:record.id,...seed.bonusCard,modelKey:seed.key,stuffyName:record.name};
 return null;
}
