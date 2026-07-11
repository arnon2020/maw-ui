import { createRoot } from "react-dom/client";
import "../index.css";
import { useFederationData } from "../hooks/useFederationData";
import { useFederationStore } from "../components/federation/store";
import { Canvas2D } from "../components/federation/Canvas2D";
import { Sidebar } from "../components/federation/Sidebar";
import { Timeline } from "../components/federation/Timeline";
import { simulate, layoutCircle, layoutOrbit } from "../components/federation/simulation";
import { machineColor } from "../components/federation/colors";

const LAYOUTS = ["orbit", "force", "circle"] as const;

function App() {
  const { connected, mqttConnected, send } = useFederationData();
  const { machines, agents, edges, version, plugins, showLineage, toggleLineage, layout, setLayout, setGraph, particles, showHistoryEdges, node, statuses, activeOnly, toggleActiveOnly } = useFederationStore();

  const reformat = () => {
    const nextIdx = (LAYOUTS.indexOf(layout as any) + 1) % LAYOUTS.length;
    const next = LAYOUTS[nextIdx];
    const W = (window.innerWidth - 240) || 900;
    const H = (window.innerHeight - 52) || 600;
    const a = [...agents];
    if (next === "circle") layoutCircle(a, W, H);
    else if (next === "orbit") layoutOrbit(a, W, H, (id) => !!statuses[id]);
    else simulate(a, edges, W, H);
    setLayout(next);
    setGraph(a, edges, particles);
  };

  const totalAgents = agents.length;
  const busyCount = agents.filter(a => statuses[a.id] === "busy").length;
  const readyCount = agents.filter(a => statuses[a.id] === "ready").length;
  const quietCount = totalAgents - busyCount - readyCount;
  const msgCount = edges.filter(e => e.type === "message").reduce((s, e) => s + e.count, 0);
  const syncCount = edges.filter(e => e.type === "sync").length;
  const lineageCount = edges.filter(e => e.type === "lineage").length;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#020a18" }}>
      <header className="flex items-center gap-4 px-6 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <a
          href="/"
          className="text-white/30 hover:text-white/60 transition-colors text-sm"
          title="Back to Office"
        >
          ←
        </a>
        <div className="flex items-center gap-3">
          <span className="text-xl">{"\uD83D\uDD78"}</span>
          <h1 className="text-lg font-black tracking-tight" style={{ color: "#00f5d4" }}>Federation Mesh</h1>
        </div>
        {node && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300/80 border border-cyan-500/20"
            title={`This lens is reading /api/config from ${node}. Each maw-js node sees the whole federation; the lens just chooses which one to ask.`}
          >
            👁 {node}
          </span>
        )}
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
          {connected ? "WS" : "OFFLINE"}
        </span>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${mqttConnected ? "bg-purple-500/15 text-purple-400" : "bg-white/5 text-white/20"}`}>
          {mqttConnected ? "MQTT" : "MQTT OFF"}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/20">
          <span>{machines.length} machine{machines.length === 1 ? "" : "s"}</span>
          <span>&middot;</span>
          <span>{totalAgents} agents</span>
          <span className="text-emerald-400/60">{busyCount} busy</span>
          <span className="text-white/25">{readyCount} ready</span>
          <button onClick={toggleActiveOnly}
            className={`cursor-pointer hover:text-cyan-400/60 ${activeOnly ? "line-through text-white/10" : "text-white/15"}`}
            title={activeOnly ? "Quiet agents hidden - click to show" : "Agents with no recent feed activity - click to hide"}>
            {quietCount} quiet
          </button>
          <span>&middot;</span>
          <button onClick={() => useFederationStore.setState({ showHistoryEdges: !showHistoryEdges })} className={`cursor-pointer hover:text-cyan-400/60 ${showHistoryEdges ? "text-white/20" : "text-white/15 line-through"}`}>{msgCount} msg</button>
          <span>&middot;</span>
          <span>{syncCount} sync</span>
          <span>&middot;</span>
          <button onClick={toggleLineage} className={`cursor-pointer hover:text-cyan-400/60 ${showLineage ? "text-cyan-400/40" : "text-white/15 line-through"}`}>{lineageCount} lineage</button>
          {plugins.length > 0 && <><span>&middot;</span><span className="text-purple-400/40">{plugins.length} plugins</span></>}
          {version && <><span>&middot;</span><span>v{version}</span></>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {machines.map(m => (
            <span key={m} className="flex items-center gap-1 text-[9px] font-mono" style={{ color: machineColor(m) }}>
              <span className="w-2 h-2 rounded-full" style={{ background: machineColor(m) }} />{m}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <Canvas2D />
        <Timeline />
        <div className="absolute bottom-4 left-4 flex gap-2">
          <button onClick={reformat}
            className="px-3 py-2 rounded-lg border text-[10px] font-mono cursor-pointer hover:bg-white/[0.05] transition-colors"
            style={{ background: "rgba(3,10,24,0.9)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(0,245,212,0.5)" }}>
            {layout === "orbit" ? "\u25CE" : layout === "force" ? "\u26A1" : "\u2B55"} {layout}
          </button>
          <button onClick={() => useFederationStore.setState({ showHistoryEdges: !showHistoryEdges })}
            className="px-3 py-2 rounded-lg border text-[10px] font-mono cursor-pointer hover:bg-white/[0.05] transition-colors"
            style={{ background: "rgba(3,10,24,0.9)", borderColor: "rgba(255,255,255,0.08)", color: showHistoryEdges ? "rgba(0,245,212,0.5)" : "rgba(255,255,255,0.2)" }}>
            {showHistoryEdges ? "\u2501 lines" : "\u2501 realtime"}
          </button>
          <button onClick={toggleActiveOnly}
            className="px-3 py-2 rounded-lg border text-[10px] font-mono cursor-pointer hover:bg-white/[0.05] transition-colors"
            title={activeOnly ? "Showing only agents active in the recent feed" : "Showing all known agents, including quiet ones"}
            style={{ background: "rgba(3,10,24,0.9)", borderColor: "rgba(255,255,255,0.08)", color: activeOnly ? "rgba(0,245,212,0.5)" : "rgba(255,255,255,0.2)" }}>
            {activeOnly ? "\uD83D\uDC41 active" : "\uD83D\uDC41 all"}
          </button>
        </div>
        <Sidebar send={send} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
