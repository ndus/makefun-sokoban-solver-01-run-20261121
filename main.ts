import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const DX = [0, 0, -1, 1], DY = [-1, 1, 0, 0], LETTER = ['u', 'd', 'l', 'r'];

function parse(text) {
  const rows = text.split('\n').filter(r => r.length);
  const w = Math.max(1, ...rows.map(r => r.length)), h = rows.length, n = w * h;
  const wall = new Uint8Array(n).fill(1), goal = new Uint8Array(n), box = new Uint8Array(n);
  let player = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const i = y * w + x, c = rows[y][x];
    if (c === '#') continue;
    wall[i] = 0;
    if (c === '.' || c === '*' || c === '+') goal[i] = 1;
    if (c === '$' || c === '*') box[i] = 1;
    if (c === '@' || c === '+') player = i;
  }
  return { w, h, n, wall, goal, box, player };
}

function liveSquares(L) {
  const { w, n, wall, goal } = L, live = new Uint8Array(n), q = new Int32Array(n);
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) if (goal[i]) { live[i] = 1; q[b++] = i; }
  while (a < b) {
    const x = q[a++];
    for (let d = 0; d < 4; d++) {
      const delta = DY[d] * w + DX[d], y = x - delta, stand = y - delta;
      if (y >= 0 && y < n && stand >= 0 && stand < n && !wall[y] && !wall[stand] && !live[y]) {
        live[y] = 1; q[b++] = y;
      }
    }
  }
  return live;
}

function components(L, live) {
  const { w, n, wall, box, goal, player } = L, cut = new Uint8Array(n);
  const py = Math.floor(player / w);
  for (let i = py * w; i < Math.min(n, (py + 1) * w); i++) if (!wall[i] && !live[i]) cut[i] = 1;
  const seen = new Uint8Array(n), rooms = [], queue = new Int32Array(n);
  let valid = player >= 0;
  for (let s = 0; s < n; s++) if (!wall[s] && !cut[s] && !seen[s]) {
    let head = 0, tail = 0; queue[tail++] = s; seen[s] = 1;
    const cells = [], boxes = [], goals = [];
    while (head < tail) {
      const x = queue[head++]; cells.push(x);
      if (box[x]) boxes.push(x);
      if (goal[x]) goals.push(x);
      for (let d = 0; d < 4; d++) {
        const y = x + DY[d] * w + DX[d];
        if (y >= 0 && y < n && !wall[y] && !cut[y] && !seen[y]) { seen[y] = 1; queue[tail++] = y; }
      }
    }
    if (boxes.length || goals.length) rooms.push({ cells, boxes: boxes.sort((a,b)=>a-b), goals });
  }
  for (let i = 0; i < n; i++) if (goal[i] && (cut[i] || !seen[i])) valid = false;
  for (let i = 0; i < n; i++) if (box[i] && cut[i]) valid = false;
  for (const r of rooms) if (!r.boxes.length || r.boxes.length !== r.goals.length) valid = false;
  return { rooms, valid };
}

function makeSublevel(L, room, others) {
  const wall = L.wall.slice(), goal = new Uint8Array(L.n);
  for (const r of others) for (const b of r.boxes) wall[b] = 1;
  for (const g of room.goals) goal[g] = 1;
  const live = liveSquares({ ...L, wall, goal });
  return { wall, goal, live };
}

function roomSearch(L, room, others, start, astar = true) {
  const { n, w } = L, sub = makeSublevel(L, room, others), { wall, goal, live } = sub;
  const k = room.boxes.length, goals = room.goals, boxes0 = room.boxes.slice().sort((a,b)=>a-b);
  if (!k) return { moves: '', end: start };
  if (start < 0 || wall[start]) return null;
  const ds = new Int16Array(n * n); ds.fill(-1);
  const q = new Int32Array(n);
  for (let s = 0; s < n; s++) if (!wall[s]) {
    let hd = 0, tl = 0; q[tl++] = s; ds[s * n + s] = 0;
    while (hd < tl) {
      const x = q[hd++], nd = ds[s*n+x] + 1;
      for (let d = 0; d < 4; d++) {
        const y = x + DY[d]*w + DX[d];
        if (y >= 0 && y < n && !wall[y] && ds[s*n+y] < 0) { ds[s*n+y] = nd; q[tl++] = y; }
      }
    }
  }
  function heuristic(bs) {
    const used = new Uint8Array(k);
    function rec(i) {
      if (i === k) return 0;
      let best = 32767;
      for (let j = 0; j < k; j++) if (!used[j]) {
        const cost = ds[bs[i]*n+goals[j]];
        if (cost >= 0) { used[j] = 1; const v = cost + rec(i+1); used[j] = 0; if (v < best) best = v; }
      }
      return best;
    }
    return rec(0);
  }
  function key(bs, reg) {
    let v = reg;
    for (let i = 0; i < k; i++) v = v * n + bs[i];
    return v;
  }
  function region(p, bs, occupied, prev = null) {
    occupied.fill(0); for (const b of bs) occupied[b] = 1;
    const reach = new Uint8Array(n), rq = new Int32Array(n); let hd = 0, tl = 0;
    reach[p] = 1; rq[tl++] = p; let low = p;
    while (hd < tl) {
      const x = rq[hd++]; if (x < low) low = x;
      for (let d = 0; d < 4; d++) {
        const y = x + DY[d]*w + DX[d];
        if (y >= 0 && y < n && !wall[y] && !occupied[y] && !reach[y]) { reach[y] = 1; rq[tl++] = y; }
      }
    }
    return { reach, low };
  }
  function frozen(bs) {
    const occ = new Uint8Array(n); for (const b of bs) occ[b] = 1;
    for (const b of bs) if (!goal[b]) {
      const x = b % w, y = Math.floor(b / w);
      for (const ox of [-1,0]) for (const oy of [-1,0]) {
        const a = (y+oy)*w+x+ox, cells = [a,a+1,a+w,a+w+1];
        let full = true, has = false;
        for (const c of cells) { if (c < 0 || c >= n || (!wall[c] && !occ[c])) full = false; if (occ[c]) has = true; }
        if (full && has) return true;
      }
    }
    return false;
  }
  function path(from, to, bs) {
    const occ = new Uint8Array(n); for (const b of bs) occ[b] = 1;
    const parent = new Int32Array(n).fill(-1), via = new Int8Array(n).fill(-1), qq = new Int32Array(n);
    let hd=0,tl=0; qq[tl++]=from; parent[from]=from;
    while (hd<tl && parent[to]<0) {
      const x=qq[hd++];
      for(let d=0;d<4;d++){const y=x+DY[d]*w+DX[d]; if(y>=0&&y<n&&!wall[y]&&!occ[y]&&parent[y]<0){parent[y]=x;via[y]=d;qq[tl++]=y;}}
    }
    if(parent[to]<0)return null;
    let out='', cur=to; while(cur!==from){out=LETTER[via[cur]]+out;cur=parent[cur];} return out;
  }
  function solved(bs) { for (let i=0;i<k;i++) if (!goal[bs[i]]) return false; return true; }
  function search(useAstar, cap) {
    const nodes = [], heap = [], best = new Map(); let order=0, expansions=0;
    function pushNode(node) {
      node.order=order++; let i=heap.length; heap.push(node);
      while(i){const p=(i-1)>>1, a=heap[p]; if(a.f<node.f || (a.f===node.f&&(a.h<node.h || (a.h===node.h&&a.order<node.order))))break;heap[i]=a;i=p;} heap[i]=node;
    }
    function popNode(){const root=heap[0], last=heap.pop(); if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length){const a=heap[c],b=heap[c+1];if(b.f<a.f||(b.f===a.f&&(b.h<a.h||(b.h===a.h&&b.order<a.order))))c++;}const v=heap[c];if(last.f<v.f||(last.f===v.f&&(last.h<v.h||(last.h===v.h&&last.order<v.order))))break;heap[i]=v;i=c;}heap[i]=last;}return root;}
    const occupied = new Uint8Array(n), r0=region(start,boxes0,occupied), h0=useAstar?heuristic(boxes0):0;
    if(h0===32767)return null;
    const first={boxes:boxes0, p:start, reg:r0.low,g:0,h:h0,f:h0,parent:-1,pushBox:-1,dir:-1,index:0}; nodes.push(first); best.set(key(boxes0,r0.low),0);pushNode(first);
    while(heap.length){
      const cur=popNode(), ck=key(cur.boxes,cur.reg); if(best.get(ck)!==cur.g)continue;
      if(solved(cur.boxes)){
        let chain=[], at=cur; while(at.parent>=0){chain.push(at);at=nodes[at.parent];} chain.reverse();
        let p=start, bs=boxes0.slice(), moves='';
        for(const node of chain){
          const bi=bs.indexOf(node.pushBox), behind=node.pushBox-DY[node.dir]*w-DX[node.dir]*1;
          const walk=path(p,behind,bs); if(walk===null)return null;
          moves+=walk+LETTER[node.dir].toUpperCase();
          const dest=node.pushBox+DY[node.dir]*w+DX[node.dir]; bs[bi]=dest; bs.sort((a,b)=>a-b); p=node.pushBox;
        }
        return {moves,end:p};
      }
      if(expansions++>=cap)return null;
      const occ = new Uint8Array(n); for(const b of cur.boxes)occ[b]=1;
      const rg=region(cur.p,cur.boxes,occupied);
      const succ=[];
      for(let bi=0;bi<k;bi++) for(let d=0;d<4;d++){
        const b=cur.boxes[bi], delta=DY[d]*w+DX[d], dst=b+delta, stand=b-delta;
        if(dst<0||dst>=n||stand<0||stand>=n||wall[dst]||occ[dst]||!live[dst]||!rg.reach[stand])continue;
        const bs=cur.boxes.slice();bs[bi]=dst;bs.sort((a,b)=>a-b);if(frozen(bs))continue;
        const hh=useAstar?heuristic(bs):0;if(hh===32767)continue;
        succ.push({bs,b,d,hh,delta:hh-cur.h});
      }
      succ.sort((a,b)=>a.delta-b.delta||a.b-b.b||a.d-b.d);
      for(const s of succ){
        const p=s.b, rr=region(p,s.bs,occupied), g=cur.g+1, kk=key(s.bs,rr.low);
        if(best.has(kk)&&best.get(kk)<=g)continue;
        best.set(kk,g);const node={boxes:s.bs,p,reg:rr.low,g,h:s.hh,f:g+s.hh,parent:cur.index,pushBox:s.b,dir:s.d,index:nodes.length};
        nodes.push(node);pushNode(node);
      }
    }
    return null;
  }
  const a=search(astar,1000000);
  if(a)return a;
  if(astar)return search(false,250000);
  return null;
}

function solve(text) {
  const L=parse(text); if(L.player<0)return '';
  const live=liveSquares(L), dec=components(L,live);
  if(dec.valid){
    let player=L.player, answer='', ok=true;
    for(let i=0;i<dec.rooms.length;i++){
      const others = dec.rooms.map((room,j) => j < i
        ? { ...room, boxes: room.goals.slice() }
        : room).filter((_,j) => j !== i);
      const r=roomSearch(L,dec.rooms[i],others,player,true);
      if(!r){ok=false;break;} answer+=r.moves; player=r.end;
      // Replay below accounts for walks and pushes before selecting the next room's player start.
      const state=L.box.slice();let p=L.player;
      for(const ch of answer){const d=LETTER.indexOf(ch.toLowerCase()), q=p+DY[d]*L.w+DX[d];if(state[q]){state[q]=0;state[q+DY[d]*L.w+DX[d]]=1;}p=q;}
      player=p;
    }
    if(ok)return answer;
  }
  const all={cells:Array.from({length:L.n},(_,i)=>i).filter(i=>!L.wall[i]),boxes:Array.from({length:L.n},(_,i)=>i).filter(i=>L.box[i]),goals:Array.from({length:L.n},(_,i)=>i).filter(i=>L.goal[i])};
  const r=roomSearch(L,all,[],L.player,true);return r?.moves??'';
}

for(const id of readdirSync(INPUT).filter(id=>/^i\d{3}$/.test(id)).sort()){
  try { const moves=solve(readFileSync(join(INPUT,id,'level.txt'),'utf8'));mkdirSync(join(OUTPUT,id),{recursive:true});writeFileSync(join(OUTPUT,id,'solution.txt'),moves+'\n'); }
  catch { mkdirSync(join(OUTPUT,id),{recursive:true});writeFileSync(join(OUTPUT,id,'solution.txt'),'\n'); }
}
