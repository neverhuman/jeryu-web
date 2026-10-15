// AgentBot.tsx — an agent's robot avatar, drawn from agentBotModel.
//
// Two modes: `badge` is the head alone in a disc, for lists and logs; `full`
// is the whole bot (body, arms, locomotion) for cards and profiles. Motion is
// pure CSS keyed on the status class (AgentBot.css), so a status change
// re-renders one class and every other bot keeps its rhythm.

import { useId, type CSSProperties, type ReactElement } from 'react';

import {
  archetypeOf,
  paletteOf,
  traitsOf,
  type BodyShape,
  type BotAgent,
  type HeadShape,
  type Palette,
  type Traits,
} from './agentBotModel';

import './AgentBot.css';

export interface AgentBotProps {
  agent: BotAgent;
  mode?: 'full' | 'badge';
  /** Width in px; a full bot is 148/120 as tall. */
  size?: number;
  /** Accessible name; omit when the text beside the bot already names the agent. */
  label?: string;
}

const HEAD_TOP: Record<HeadShape, number> = { capsule: 20, box: 22, orb: 16, dome: 18, hex: 16 };

function headShape(head: HeadShape): ReactElement {
  switch (head) {
    case 'capsule': return <rect x="30" y="20" width="60" height="52" rx="24" />;
    case 'box': return <rect x="27" y="22" width="66" height="48" rx="9" />;
    case 'orb': return <circle cx="60" cy="48" r="32" />;
    case 'dome': return <path d="M26 66V48a34 30 0 0 1 68 0v18a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6z" />;
    case 'hex': return <path d="M60 16L89 31V63L60 78L31 63V31Z" />;
  }
}

interface BodyGeometry {
  /** Left and right shoulder anchors. */
  shoulders: readonly [readonly [number, number], readonly [number, number]];
  /** x, y, width, height of the torso's bounding box. */
  box: readonly [number, number, number, number];
}

const BODY: Record<BodyShape, BodyGeometry> = {
  capsule: { shoulders: [[41, 88], [79, 88]], box: [40, 80, 40, 32] },
  box: { shoulders: [[36, 86], [84, 86]], box: [35, 79, 50, 32] },
  orb: { shoulders: [[46, 92], [74, 92]], box: [44, 81, 32, 32] },
  bell: { shoulders: [[41, 88], [79, 88]], box: [34, 80, 52, 32] },
  slim: { shoulders: [[46, 88], [74, 88]], box: [45, 80, 30, 33] },
};

function bodyShape(body: BodyShape): ReactElement {
  switch (body) {
    case 'capsule': return <rect x="40" y="80" width="40" height="32" rx="15" />;
    case 'box': return <rect x="35" y="79" width="50" height="32" rx="6" />;
    case 'orb': return <circle cx="60" cy="97" r="16" />;
    case 'bell': return <path d="M43 80H77Q88 98 86 112H34Q32 98 43 80Z" />;
    case 'slim': return <rect x="45" y="80" width="30" height="33" rx="12" />;
  }
}

function Antenna({ t, p, top, sw }: { t: Traits; p: Palette; top: number; sw: number }): JSX.Element {
  const ax = Number((60 + t.look * 0.4).toFixed(1));
  const ay = top + 4;
  const shapes = [
    <><path d={`M${ax} ${ay}V${top - 12}`} /><circle className="agent-avatar__tip" cx={ax} cy={top - 15} r="4" /></>,
    <><path d={`M${ax - 7} ${ay}L${ax - 13} ${top - 11}M${ax + 7} ${ay}L${ax + 13} ${top - 11}`} />
      <circle className="agent-avatar__tip" cx={ax - 13} cy={top - 13} r="3.2" /><circle className="agent-avatar__tip" cx={ax + 13} cy={top - 13} r="3.2" /></>,
    <><path d={`M${ax} ${ay}l-4 -4l8 -4l-8 -4l4 -3`} fill="none" /><circle className="agent-avatar__tip" cx={ax} cy={top - 14} r="3.5" /></>,
    <><path d={`M${ax} ${ay}V${top - 6}q0 -8 8 -8`} fill="none" /><circle className="agent-avatar__tip" cx={ax + 9} cy={top - 14} r="3.2" /></>,
    <><path d={`M${ax - 6} ${ay}L${ax} ${top - 11}L${ax + 6} ${ay}Z`} fill={p.accent} /><circle className="agent-avatar__tip" cx={ax} cy={top - 11} r="2.4" /></>,
  ];
  return (
    <g stroke={p.line} strokeWidth={sw * 1.1} strokeLinecap="round" strokeLinejoin="round" fill={p.glow}>
      {shapes[t.antenna]}
    </g>
  );
}

/** The ear on the side the bot looks toward tucks behind the head (a three-quarter view). */
function Ear({ x, side, t, p, sw }: { x: number; side: -1 | 1; t: Traits; p: Palette; sw: number }): JSX.Element {
  const far = t.look !== 0 && Math.sign(t.look) === side;
  const transform = far ? `translate(${x - side * 3} 48) scale(.62)` : `translate(${x} 48)`;
  const shapes = [
    <circle r="6.5" />,
    <rect x="-4" y="-9" width="8" height="18" rx="4" />,
    <path d={`M0 -8L${side * 9} 0L0 8Z`} />,
  ];
  return (
    <g transform={transform} fill={p.accent} stroke={p.line} strokeWidth={sw * 0.8} strokeLinejoin="round">
      {shapes[t.ear]}
    </g>
  );
}

function Face({ t, p, ids, sw }: { t: Traits; p: Palette; ids: Ids; sw: number }): JSX.Element {
  const vx = 60 + t.look;
  const twin = t.visor === 3;
  // x, y, width, height, corner radius
  type VisorRect = readonly [number, number, number, number, number];
  const single: readonly VisorRect[] = [[vx - 22, 34, 44, 24, 10], [vx - 23, 34, 46, 24, 12], [vx - 24, 37, 48, 18, 6]];
  const visorRects: readonly VisorRect[] = twin ? [[vx - 23, 35, 21, 22, 8], [vx + 2, 35, 21, 22, 8]] : [single[t.visor]];
  const ex = twin ? 12.5 : 10;
  const eye = (x: number): ReactElement => [
    <circle cx={x} cy="46" r="4" />,
    <ellipse cx={x} cy="46" rx="3.4" ry="5.4" />,
    <path d={`M${x - 5} 48q5 -7 10 0`} fill="none" strokeWidth="2.6" strokeLinecap="round" />,
    <rect x={x - 6} y="44" width="12" height="4" rx="2" />,
    <circle cx={x} cy="46" r="4.2" fill="none" strokeWidth="2.4" />,
  ][t.eyes];
  const mouth = t.visor < 2 ? [null, <path d={`M${vx - 4} 54h8`} />, <path d={`M${vx - 5} 53q5 4 10 0`} />][t.mouth] : null;
  return (
    <>
      <g className="agent-avatar__visor" fill={`url(#${ids.visor})`} stroke={p.line} strokeWidth={sw * 0.9}>
        {visorRects.map(([x, y, w, h, rx]) => <rect key={x} x={x} y={y} width={w} height={h} rx={rx} />)}
      </g>
      <path d={`M${vx - 16} 39q10 -3 22 -1`} stroke="#fff" strokeOpacity=".2" strokeWidth="2" fill="none" strokeLinecap="round" />
      <g className="agent-avatar__eyes" style={{ color: p.glow, transformOrigin: `${vx}px 46px` }} fill="currentColor" stroke="currentColor" strokeWidth="0">
        <g key="l">{eye(vx - ex)}</g>
        <g key="r">{eye(vx + ex)}</g>
      </g>
      {mouth ? (
        <g className="agent-avatar__mouth" style={{ color: p.glow }} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".85">
          {mouth}
        </g>
      ) : null}
      {t.acc === 3 ? <circle cx={vx + ex} cy="46" r="8" fill="none" stroke={p.accent} strokeWidth="1.8" /> : null}
    </>
  );
}

interface Ids {
  shell: string;
  visor: string;
  headClip: string;
  bodyClip: string;
}

function Head({ agent, t, p, ids, sw }: { agent: BotAgent; t: Traits; p: Palette; ids: Ids; sw: number }): JSX.Element {
  const a = archetypeOf(agent.harness);
  const top = HEAD_TOP[a.head];
  const decal = [
    null,
    <path d="M10 40L56 -2L66 -2L20 40Z" fill={p.accent} opacity=".85" />,
    <><rect x="55" y="0" width="3.5" height="34" fill={p.accent} /><rect x="61.5" y="0" width="3.5" height="34" fill={p.accent} /></>,
  ][t.decal];
  return (
    <g className="agent-avatar__head">
      <Antenna t={t} p={p} top={top} sw={sw} />
      <Ear x={a.earX[0]} side={-1} t={t} p={p} sw={sw} />
      <Ear x={a.earX[1]} side={1} t={t} p={p} sw={sw} />
      <g fill={`url(#${ids.shell})`} stroke={p.line} strokeWidth={sw} strokeLinejoin="round">{headShape(a.head)}</g>
      <g clipPath={`url(#${ids.headClip})`}>
        {decal}
        <ellipse cx="44" cy={top + 9} rx="11" ry="3.5" fill="#fff" opacity=".5" />
      </g>
      <Face t={t} p={p} ids={ids} sw={sw} />
    </g>
  );
}

function Bubbles(): JSX.Element {
  return (
    <>
      <g className="agent-avatar__bubble agent-avatar__bubble--error" display="none">
        <circle cx="96" cy="12" r="9" fill="#ff4d5e" />
        <path d="M96 7v6M96 16.5v.4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g className="agent-avatar__bubble agent-avatar__bubble--done" display="none">
        <circle cx="96" cy="12" r="9" fill="#38c98a" />
        <path d="M91.5 12l3 3l6 -6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function Body({ agent, t, p, ids, sw }: { agent: BotAgent; t: Traits; p: Palette; ids: Ids; sw: number }): JSX.Element {
  const a = archetypeOf(agent.harness);
  const geometry = BODY[a.body];
  const [bx, by, bw, bh] = geometry.box;
  const worker = agent.type === 'worker';
  const cx = 60;
  const cy = by + 12;
  const limb = t.limbs ? p.dark : `url(#${ids.shell})`;
  const marks = [
    <path d={`M${cx} ${cy - 5}l5 5l-5 5l-5 -5Z`} />,
    <circle cx={cx} cy={cy} r="3.6" fill="none" stroke={p.glow} strokeWidth="2" />,
    <path d={`M${cx + 1} ${cy - 5}l-5 6h4l-1 4l5 -6h-4Z`} />,
    <><rect x={cx - 5} y={cy - 3} width="10" height="2" rx="1" /><rect x={cx - 5} y={cy + 1} width="7" height="2" rx="1" /></>,
    <><circle cx={cx - 3} cy={cy - 2.5} r="1.4" /><circle cx={cx + 3} cy={cy - 2.5} r="1.4" /><circle cx={cx - 3} cy={cy + 2.5} r="1.4" /><circle cx={cx + 3} cy={cy + 2.5} r="1.4" /></>,
  ];
  const pose = ([[10, 10], [20, 8], [8, 22], [15, 15]] as const)[t.pose];
  const arm = (i: 0 | 1): JSX.Element => {
    const [x, y] = geometry.shoulders[i];
    const angle = i ? -pose[1] : pose[0];
    return (
      <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
        <g className={`agent-avatar__arm agent-avatar__arm--${i ? 'right' : 'left'}`}>
          {i === 1 && worker ? <path d="M-4 22l-3 7M4 22l3 7" stroke={p.dark} strokeWidth="3" strokeLinecap="round" fill="none" /> : null}
          <rect x="-3.6" y="0" width="7.2" height="19" rx="3.6" fill={limb} stroke={p.line} strokeWidth={sw * 0.7} />
          <circle cy="20" r={worker ? 5.2 : 4.6} fill={p.accent} stroke={p.line} strokeWidth={sw * 0.7} />
          <circle r="5" fill={p.dark} />
        </g>
      </g>
    );
  };
  return (
    <>
      <Locomotion agent={agent} p={p} limb={limb} sw={sw} />
      <g fill={`url(#${ids.shell})`} stroke={p.line} strokeWidth={sw} strokeLinejoin="round">{bodyShape(a.body)}</g>
      <g clipPath={`url(#${ids.bodyClip})`}>
        <rect x={bx} y={by} width={bw} height="7" fill="#fff" opacity=".28" />
        {worker ? (
          <>
            <rect x={bx - 2} y={by + bh - 10} width={bw + 4} height="6" fill={p.dark} />
            <rect x="56" y={by + bh - 10.5} width="8" height="7" rx="1.5" fill={p.accent} />
          </>
        ) : (
          <path d={`M${bx} ${by + bh - 9}H${bx + bw}`} stroke={p.line} strokeWidth="1.4" strokeDasharray="3 3" fill="none" />
        )}
      </g>
      <rect x={cx - 9} y={cy - 7} width="18" height="14" rx="5" fill={p.dark} opacity=".88" />
      <g className="agent-avatar__mark" fill={p.glow}>{marks[t.mark]}</g>
      {t.acc === 2 ? (
        <>
          <path d="M48 78Q60 84 72 78L72 82Q60 88 48 82Z" fill={p.accent} stroke={p.line} strokeWidth="1.4" />
          <path d="M66 83l4 10l-6 -1Z" fill={p.accent} stroke={p.line} strokeWidth="1.2" />
        </>
      ) : null}
      {arm(0)}
      {arm(1)}
      {t.acc === 1 ? (
        <ellipse cx={geometry.shoulders[0][0]} cy={geometry.shoulders[0][1] - 1} rx="8" ry="5.5" fill={p.accent} stroke={p.line} strokeWidth="1.4" />
      ) : null}
    </>
  );
}

function Locomotion({ agent, p, limb, sw }: { agent: BotAgent; p: Palette; limb: string; sw: number }): JSX.Element {
  switch (archetypeOf(agent.harness).loco) {
    case 'legs':
      return (
        <>
          {[51, 69].map((x) => (
            <g key={x}>
              <rect x={x - 5.5} y="106" width="11" height="20" rx="5.5" fill={limb} stroke={p.line} strokeWidth={sw * 0.7} />
              <ellipse cx={x + (x < 60 ? -1 : 1)} cy="127" rx="9" ry="4.6" fill={p.dark} />
            </g>
          ))}
        </>
      );
    case 'stilts':
      return (
        <>
          {[54, 66].map((x) => (
            <g key={x}>
              <rect x={x - 3} y="108" width="6" height="20" rx="3" fill={p.dark} />
              <rect x={x - 6} y="127" width="12" height="4" rx="2" fill={p.accent} />
            </g>
          ))}
        </>
      );
    case 'treads':
      return (
        <>
          <rect x="31" y="110" width="58" height="19" rx="9.5" fill={p.dark} stroke={p.line} strokeWidth={sw * 0.7} />
          {[42, 54, 66, 78].map((x) => (
            <g key={x}>
              <circle cx={x} cy="119.5" r="4.6" fill={p.shellB} />
              <circle cx={x} cy="119.5" r="1.6" fill={p.dark} />
            </g>
          ))}
        </>
      );
    case 'wheel':
      return (
        <>
          <rect x="55" y="106" width="10" height="10" rx="3" fill={p.dark} />
          <circle cx="60" cy="121" r="11" fill={p.dark} stroke={p.line} strokeWidth={sw * 0.7} />
          <circle cx="60" cy="121" r="4.5" fill={p.accent} />
        </>
      );
    case 'hover':
      return (
        <>
          <path d="M53 111H67L64 117H56Z" fill={p.dark} />
          <ellipse className="agent-avatar__thrust" cx="60" cy="123" rx="15" ry="3.6" fill={p.glow} opacity=".55" />
          <ellipse cx="60" cy="123" rx="20" ry="5" fill="none" stroke={p.glow} strokeOpacity=".5" strokeWidth="1.4" />
        </>
      );
  }
}

export function AgentBot({ agent, mode = 'full', size = 150, label }: AgentBotProps): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids: Ids = { shell: `${uid}-shell`, visor: `${uid}-visor`, headClip: `${uid}-head`, bodyClip: `${uid}-body` };
  const t = traitsOf(agent);
  const p = paletteOf(agent.harness);
  const a = archetypeOf(agent.harness);
  const badge = mode === 'badge';
  const sw = badge ? 3 : 2.2;
  const className = `agent-avatar agent-avatar--${agent.status}${badge ? ' agent-avatar--badge' : ''}`;
  const style = { '--agent-avatar-delay': `-${t.delay}s` } as CSSProperties;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  const neck = <rect x="54" y="68" width="12" height="14" rx="3" fill={p.dark} />;
  const defs = (
    <defs>
      <linearGradient id={ids.shell} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={p.shellA} /><stop offset=".55" stopColor={p.shellB} /><stop offset="1" stopColor={p.shellC} />
      </linearGradient>
      <linearGradient id={ids.visor} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1e2c47" /><stop offset="1" stopColor="#060a15" />
      </linearGradient>
      <clipPath id={ids.headClip}>{headShape(a.head)}</clipPath>
      <clipPath id={ids.bodyClip}>{bodyShape(a.body)}</clipPath>
    </defs>
  );

  if (badge) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="18 0 84 84" width={size} height={size} style={style} {...a11y}>
        {defs}
        <circle cx="60" cy="42" r="42" fill={p.dark} />
        <g className="agent-avatar__rig">{neck}<Head agent={agent} t={t} p={p} ids={ids} sw={sw} /></g>
        <Bubbles />
      </svg>
    );
  }

  const hover = a.loco === 'hover';
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 -10 120 148" width={size} height={Math.round((size * 148) / 120)} style={style} {...a11y}>
      {defs}
      <ellipse cx="60" cy="134" rx={hover ? 15 : 26} ry="3.6" fill="#000" opacity={hover ? 0.22 : 0.4} />
      <g className="agent-avatar__rig">
        {neck}
        <Body agent={agent} t={t} p={p} ids={ids} sw={sw} />
        <Head agent={agent} t={t} p={p} ids={ids} sw={sw} />
        <g className="agent-avatar__orbit" display="none">
          {[0, 120, 240].map((deg) => {
            const r = (deg * Math.PI) / 180;
            return <circle key={deg} cx={(60 + 40 * Math.cos(r)).toFixed(1)} cy={(44 + 40 * Math.sin(r)).toFixed(1)} r="2.6" fill={p.glow} />;
          })}
        </g>
      </g>
      <Bubbles />
    </svg>
  );
}
