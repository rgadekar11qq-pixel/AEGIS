/* AEGIS Patient Intelligence Core
 * A small Three.js scene whose activity is driven only by the existing pipeline state.
 * It intentionally represents information flow, not anatomy or physiological measurements.
 */
(function () {
  const stage = document.getElementById("intelligenceStage");
  const mount = document.getElementById("threeScene");
  const detail = document.getElementById("sceneDetail");
  const status = document.getElementById("sceneStatus");
  const fallback = document.getElementById("webglFallback");
  const resetButton = document.getElementById("sceneReset");
  const motionButton = document.getElementById("sceneMotion");

  if (!stage || !mount || !window.THREE) {
    stage?.classList.add("webgl-unavailable");
    fallback?.classList.remove("hidden");
    return;
  }

  const THREE = window.THREE;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = prefersReduced.matches;
  let renderer, scene, camera, root, core, wire, pulse, raycaster;
  let pointer = new THREE.Vector2();
  let objects = [], nodes = new Map(), links = [], packets = [];
  let animationFrame, disposed = false;
  let dragging = false, previous = { x: 0, y: 0 }, rotation = { x: -0.08, y: 0.28 }, targetRotation = { x: -0.08, y: 0.28 };
  let distance = 12, targetDistance = 12, selectedId = null;
  const clock = new THREE.Clock();

  const agentDefinitions = [
    { id:"scribe", label:"Scribe", role:"Entity extraction", color:"#a29bfe", position:[-4.0, 1.65, 0.5] },
    { id:"guardian", label:"Guardian", role:"Medication & allergy safety", color:"#35d6b0", position:[-2.8, -2.25, 1.4] },
    { id:"compliance", label:"Compliance", role:"Billing validation", color:"#f7c966", position:[0.2, 2.85, -0.5] },
    { id:"sentinel", label:"Sentinel", role:"Clinical gaps & deterioration", color:"#f58aae", position:[3.55, 1.45, 0.35] },
    { id:"advocate", label:"Advocate", role:"Prior authorization", color:"#35d6b0", position:[3.6, -1.7, -0.45] },
    { id:"vision", label:"Vision", role:"Diagnostic imaging", color:"#39d9f2", position:[0.6, -3.05, 0.2] },
    { id:"arbiter", label:"Arbiter", role:"Evidence consensus", color:"#a78bfa", position:[-3.55, 0.0, -1.15] },
  ];

  function hex(value) { return new THREE.Color(value); }
  function statusText(value) { return ({ running:"ANALYZING", complete:"COMPLETE", error:"ATTENTION", skipped:"NOT REQUIRED", queued:"QUEUED", idle:"READY" })[value] || "READY"; }
  function currentAgent(id) { return typeof AGENTS !== "undefined" ? AGENTS.find(a => a.id === id) : null; }
  function labelSprite(text, color) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 420; canvas.height = 88;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "700 30px Inter, Arial";
    context.textAlign = "center";
    context.fillStyle = color;
    context.fillText(text.toUpperCase(), 210, 35);
    context.font = "600 20px Arial";
    context.fillStyle = "#9BAEC2";
    context.fillText("SPECIALIST", 210, 65);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, transparent:true, depthTest:false }));
    sprite.scale.set(2.05, 0.43, 1);
    return sprite;
  }
  function updateDetail(id) {
    const agent = agentDefinitions.find(item => item.id === id);
    if (!agent) return;
    selectedId = id;
    const live = currentAgent(id);
    const state = live?.state || "idle";
    detail.innerHTML = `<span class="scene-detail-eyebrow">${agent.label.toUpperCase()} SPECIALIST</span><strong>${agent.role}</strong><span class="node-state">● ${statusText(state)}${live?.time ? ` · ${(live.time / 1000).toFixed(1)}s` : ""}</span><p>This node reflects the AEGIS pipeline state. Open Individual Reports for output and supporting evidence.</p>`;
  }
  function createLink(a, b) {
    const curve = new THREE.CatmullRomCurve3([a.clone(), new THREE.Vector3().lerpVectors(a, b, .5).add(new THREE.Vector3(0, .45, -.7)), b.clone()]);
    const geometry = new THREE.TubeGeometry(curve, 44, .012, 5, false);
    const material = new THREE.MeshBasicMaterial({ color:"#2d5a74", transparent:true, opacity:.52 });
    const mesh = new THREE.Mesh(geometry, material);
    root.add(mesh);
    links.push({ mesh, from:a, to:b, source:null, target:null });
  }
  function spawnPackets(from, to, color) {
    if (reducedMotion) return;
    const start = from === "core" ? new THREE.Vector3(0, 0, 0) : nodes.get(from)?.group.position;
    const end = nodes.get(to)?.group.position;
    if (!start || !end) return;
    for (let i = 0; i < 5; i++) {
      const point = new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 10), new THREE.MeshBasicMaterial({ color, transparent:true }));
      root.add(point);
      packets.push({ point, start:start.clone(), end:end.clone(), progress:-i*.13, speed:.32 + Math.random()*.15 });
    }
  }
  function createScene() {
    try {
      renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      mount.appendChild(renderer.domElement);
    } catch (error) {
      stage.classList.add("webgl-unavailable"); fallback.classList.remove("hidden"); return false;
    }
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, .1, 60);
    root = new THREE.Group(); scene.add(root);
    raycaster = new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight("#9be7ff", "#03101d", 1.65));
    const key = new THREE.PointLight("#39d9f2", 38, 18, 2); key.position.set(1, 4, 5); scene.add(key);
    const rim = new THREE.PointLight("#a78bfa", 24, 14, 2); rim.position.set(-5, -3, -3); scene.add(rim);

    const coreGroup = new THREE.Group(); root.add(coreGroup); core = coreGroup;
    const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 3), new THREE.MeshStandardMaterial({ color:"#164a69", emissive:"#0b6d8d", emissiveIntensity:.55, metalness:.72, roughness:.22, transparent:true, opacity:.92 }));
    coreGroup.add(inner);
    wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.53, 2), new THREE.MeshBasicMaterial({ color:"#6de8fb", wireframe:true, transparent:true, opacity:.28 }));
    coreGroup.add(wire);
    pulse = new THREE.Mesh(new THREE.IcosahedronGeometry(1.65, 2), new THREE.MeshBasicMaterial({ color:"#39d9f2", wireframe:true, transparent:true, opacity:.08 }));
    coreGroup.add(pulse);
    const ringMaterial = new THREE.MeshBasicMaterial({ color:"#39d9f2", transparent:true, opacity:.28 });
    [[2.2,.025,0,0,0],[2.9,.018,.68,.35,.18],[3.55,.012,1.15,-.18,.65]].forEach(([radius,tube,rx,ry,rz]) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 120), ringMaterial.clone());
      ring.rotation.set(rx, ry, rz); coreGroup.add(ring);
    });

    agentDefinitions.forEach(def => {
      const group = new THREE.Group(); group.position.set(...def.position); root.add(group);
      const halo = new THREE.Mesh(new THREE.RingGeometry(.42, .46, 48), new THREE.MeshBasicMaterial({ color:def.color, transparent:true, opacity:.35, side:THREE.DoubleSide }));
      halo.rotation.x = Math.PI / 2; group.add(halo);
      const node = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 2), new THREE.MeshStandardMaterial({ color:def.color, emissive:def.color, emissiveIntensity:.28, metalness:.75, roughness:.2 }));
      node.userData.agentId = def.id; group.add(node); objects.push(node);
      const label = labelSprite(def.label, def.color); label.position.y = .66; group.add(label);
      nodes.set(def.id, { group, node, halo, label, def, state:"idle", time:null });
      createLink(new THREE.Vector3(0,0,0), group.position);
    });
    links.forEach((link, index) => { link.source = "core"; link.target = agentDefinitions[index].id; });
    resize();
    return true;
  }
  function resize() {
    if (!renderer || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }
  function positionCamera() {
    const r = distance; camera.position.set(Math.sin(rotation.y) * r, rotation.x * r, Math.cos(rotation.y) * r); camera.lookAt(0, 0, 0);
  }
  function animate() {
    if (disposed) return;
    animationFrame = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), .05), t = clock.getElapsedTime();
    rotation.x += (targetRotation.x - rotation.x) * .09; rotation.y += (targetRotation.y - rotation.y) * .09; distance += (targetDistance - distance) * .12;
    if (!reducedMotion && !dragging) targetRotation.y += .0008;
    if (!reducedMotion) { core.rotation.y += delta * .22; wire.rotation.x -= delta * .09; pulse.scale.setScalar(1 + Math.sin(t * 2) * .025); }
    nodes.forEach((item, id) => {
      const live = currentAgent(id); const state = live?.state || item.state;
      const active = state === "running";
      const complete = state === "complete";
      item.node.material.emissiveIntensity = active ? .95 + Math.sin(t * 5) * .2 : complete ? .55 : .22;
      item.halo.material.opacity = active ? .75 : complete ? .5 : .24;
      if (!reducedMotion) { item.halo.rotation.z += active ? delta * 2.4 : delta * .35; item.group.position.y = item.def.position[1] + (active ? Math.sin(t * 3 + item.def.position[0]) * .08 : 0); }
      const selected = selectedId === id; item.node.scale.setScalar(selected ? 1.45 : 1); item.label.material.opacity = selected ? 1 : .8;
    });
    for (let i = packets.length - 1; i >= 0; i--) { const packet = packets[i]; packet.progress += packet.speed * delta; if (packet.progress >= 1) { root.remove(packet.point); packet.point.geometry.dispose(); packet.point.material.dispose(); packets.splice(i,1); continue; } const amount = Math.max(0, packet.progress); packet.point.position.lerpVectors(packet.start, packet.end, amount); packet.point.material.opacity = Math.sin(amount * Math.PI); }
    positionCamera(); renderer.render(scene, camera);
  }
  function setStatus(className, text) { status.className = `scene-status ${className || ""}`; status.innerHTML = `<span></span> ${text}`; }
  function updateAgent(id, state, time) {
    const item = nodes.get(id); if (!item) return;
    item.state = state; item.time = time || item.time;
    if (state === "running") { setStatus("running", `${item.def.label} is analyzing`); spawnPackets("core", id, item.def.color); }
    if (state === "complete") { spawnPackets(id, "arbiter", item.def.color); const allDone = [...nodes.values()].every(node => ["complete", "skipped"].includes(currentAgent(node.def.id)?.state || node.state)); if (allDone) setStatus("complete", "Consensus pipeline complete"); }
    if (state === "error") setStatus("error", `${item.def.label} needs attention`);
    if (selectedId === id) updateDetail(id);
  }
  function reset() { targetRotation = { x:-.08, y:.28 }; targetDistance = 12; selectedId = null; detail.innerHTML = '<span class="scene-detail-eyebrow">SELECT A SPECIALIST</span><strong>Seven-agent consensus</strong><p>Each node reflects the real-time pipeline state. Select a node to review its role and progress.</p>'; }
  function updatePointer(event) { const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; }
  function selectFromPointer(event) {
    updatePointer(event);
    // Ensure the raycaster sees the latest animated transform, including a
    // click that lands between rendered frames on a throttled device.
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(objects, false)[0];
    if (hit?.object?.userData?.agentId) updateDetail(hit.object.userData.agentId);
  }
  function setupInteraction() {
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", event => { dragging = true; previous = { x:event.clientX, y:event.clientY }; canvas.setPointerCapture?.(event.pointerId); });
    canvas.addEventListener("pointermove", event => { if (!dragging) return; targetRotation.y += (event.clientX - previous.x) * .008; targetRotation.x = Math.max(-.45, Math.min(.45, targetRotation.x + (event.clientY - previous.y) * .006)); previous = { x:event.clientX, y:event.clientY }; });
    canvas.addEventListener("pointerup", event => { const moved = Math.hypot(event.clientX - previous.x, event.clientY - previous.y); dragging = false; if (moved < 6) selectFromPointer(event); });
    // Some browser automation and assistive input paths emit a click without a
    // PointerEvent sequence; keep specialist selection available in both cases.
    canvas.addEventListener("click", selectFromPointer);
    canvas.addEventListener("wheel", event => { event.preventDefault(); targetDistance = Math.max(7.5, Math.min(17, targetDistance + event.deltaY * .008)); }, { passive:false });
    stage.addEventListener("keydown", event => { if (event.key === "ArrowLeft") targetRotation.y -= .12; if (event.key === "ArrowRight") targetRotation.y += .12; if (event.key === "ArrowUp") targetDistance = Math.max(7.5, targetDistance - .7); if (event.key === "ArrowDown") targetDistance = Math.min(17, targetDistance + .7); if (event.key === "Home") reset(); });
    resetButton.addEventListener("click", reset);
    motionButton.addEventListener("click", () => { reducedMotion = !reducedMotion; motionButton.setAttribute("aria-pressed", String(reducedMotion)); motionButton.textContent = reducedMotion ? "Enable motion" : "Reduce motion"; });
  }
  if (createScene()) {
    setupInteraction();
    new ResizeObserver(resize).observe(stage);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => { if (document.hidden) clock.stop(); else clock.start(); });
    setStatus("", "Waiting for a case"); animate();
    window.aegisCore = { updateAgent, reset };
  }
})();
