export const launcherStyles = `
:host{

all:initial;

position:fixed;

inset:0;

z-index:2147483646;

pointer-events:none;

color-scheme:light dark;

font:13px/1.4 system-ui,sans-serif}


*{

box-sizing:border-box}

button{

font:inherit;

color:inherit;

cursor:pointer;

border:0;

background:transparent;

border-radius:6px}


.group{

position:fixed;

display:flex;

gap:2px;

padding:4px;

border-radius:8px;

background:rgba(255,252,248,.98);

color:#3f3f46;

border:1px solid rgba(67,40,24,.11);

backdrop-filter:blur(12px);

box-shadow:0 8px 20px #0003;

pointer-events:auto}


:host([data-theme=dark]) .group,:host([data-theme=dark]) .menu,:host([data-theme=dark]) .error{

background:rgba(24,24,27,.95);

color:#dedee3}


button.main{

width:32px;

height:32px;

display:grid;

place-items:center}

button.actions{
position:relative}

button.actions::before{
content:'';
position:absolute;
right:2px;
bottom:2px;
width:0;
height:0;
border-inline:2px solid transparent;
border-top:3px solid currentColor;
opacity:.42;
pointer-events:none}

button.actions[data-menu-side=up]::before{
top:2px;
bottom:auto;
transform:rotate(180deg)}

button.actions[aria-expanded=true]::before{
border-top-color:#ea580c;
opacity:1}

:host([data-theme=dark]) button.actions[aria-expanded=true]::before{
border-top-color:#f97316}

button:hover{

background:#8882}

button:focus-visible{

outline:2px solid #b95826;

outline-offset:1px}

button:disabled{

opacity:.5;

cursor:wait}

svg{

width:18px;

height:18px;

stroke:currentColor;

fill:none;

stroke-width:1.6;

stroke-linecap:round;

stroke-linejoin:round}


.grip{

position:absolute;

width:20px;

height:32px;

top:4px;

opacity:0;

pointer-events:none;

cursor:grab;

touch-action:none}

.group .grip{

display:grid;

place-items:center;

padding:0;

background:inherit;

color:inherit}

.group .grip svg{

width:16px;

height:16px;

stroke-width:2}

.group[data-left=true] .grip{

left:100%}

.group[data-left=false] .grip{

right:100%}

.group:hover .grip,.group:focus-within .grip,.group[data-dragging=true] .grip{

opacity:1;

pointer-events:auto}

.group[data-dragging=true] .grip{

cursor:grabbing}


.group[data-hidden=true]{

opacity:0;

pointer-events:none}

.group[data-hidden=true] button{

pointer-events:none}


.menu{

position:fixed;

width:280px;

max-width:calc(100vw - 16px);

max-height:calc(100vh - 96px);

overflow:auto;

overscroll-behavior:contain;

background:rgba(255,252,248,.98);

color:#3f3f46;

box-shadow:0 4px 16px #0003;

border-radius:4px;

padding:5px;

pointer-events:auto}

.menu button{

display:flex;

align-items:center;

gap:6px;

min-height:32px;

margin-top:2px;

text-align:left;

width:100%;

padding:6px 8px;

white-space:normal;

overflow-wrap:anywhere}

.menu button:first-child{margin-top:0}

.menu button svg{width:18px;height:18px;flex-shrink:0;stroke-width:1.75}

.menu button span{min-width:0}

.menu button kbd{margin-inline-start:auto;flex-shrink:0;font:inherit;font-variant-numeric:tabular-nums}

.error{

position:fixed;

padding:8px 12px;

background:#fffaf5;

color:#7d2921;

max-width:280px;

border-radius:8px;

box-shadow:0 4px 16px #0003;

pointer-events:auto}


.guide{
position:fixed;
inset:0;
pointer-events:none;
color:#27272a}

:host([data-theme=dark]) .guide{
color:#f4f4f5}

.guide-zone{
position:absolute;
width:64px;
height:64px;
border:1px dashed currentColor;
border-radius:12px;
opacity:.65;
background:color-mix(in srgb,currentColor 4%,transparent)}

.guide-zone[data-active=true]{
border:2px solid currentColor;
opacity:1;
background:color-mix(in srgb,currentColor 10%,transparent)}

.guide-zone[data-active=true]::after{
content:"";
position:absolute;
left:50%;
top:50%;
transform:translate(-50%,-50%);
width:28px;
height:8px;
border-radius:2px;
background:currentColor}

`;
