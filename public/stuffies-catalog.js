/* Hosted reference catalog; no original room photos. */
export const HOSTED_VERSION=1;
export const HOSTED_STUFFIES=[
  {
    "id": "stuffy-hosted-turtwig",
    "key": "turtwig",
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
    "name": "Charmander",
    "aliases": [
      "charmander",
      "charmandar"
    ],
    "views": [
      "charmander-front",
      "charmander-side"
    ]
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
