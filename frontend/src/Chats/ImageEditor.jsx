import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { DndContext } from "@dnd-kit/core"; // New
import { useDraggable } from "@dnd-kit/core"; // New
import { restrictToParentElement } from "@dnd-kit/modifiers"; // New
import ReactCrop from "react-image-crop";
import { v4 as uuidv4 } from "uuid";
import useUndo from "use-undo";
import "react-image-crop/dist/ReactCrop.css";
import "../Designs/ImageEditor.css";

// --- Helper Constants ---
const DEFAULT_TEXT = {
  id: "",
  content: "✨ Edit Me",
  x: 100,
  y: 100,
  z: 1,
  fontSize: 32,
  color: "#fff",
  fontFamily: "Inter,Arial,sans-serif",
  bold: false,
  italic: false,
  underline: false,
  shadow: false,
  outline: false,
  align: "left",
  rotation: 0,
  letterSpacing: 0,
  lineHeight: 1.2,
  gradient: false,
  gradientFrom: "#fff",
  gradientTo: "#ccc",
  locked: false,
  type: "text"
};

const FILTERS_LIST = [
  { name: "Brightness", key: "brightness", min: 0, max: 200, step: 1, default: 100, unit: "%" },
  { name: "Contrast", key: "contrast", min: 0, max: 200, step: 1, default: 100, unit: "%" },
  { name: "Saturation", key: "saturate", min: 0, max: 300, step: 1, default: 100, unit: "%" },
  { name: "Grayscale", key: "grayscale", min: 0, max: 100, step: 1, default: 0, unit: "%" },
  { name: "Sepia", key: "sepia", min: 0, max: 100, step: 1, default: 0, unit: "%" },
  { name: "Invert", key: "invert", min: 0, max: 100, step: 1, default: 0, unit: "%" },
  { name: "Blur", key: "blur", min: 0, max: 10, step: 0.1, default: 0, unit: "px" }
];

const FILTER_PRESETS = [
  { name: "B&W", values: { grayscale: 100, sepia: 0, brightness: 100, contrast: 100, saturate: 0 } },
  { name: "Warm", values: { sepia: 30, brightness: 110, contrast: 105 } },
  { name: "Cool", values: { brightness: 100, contrast: 100, saturate: 110, sepia: 0, grayscale: 0 } },
  { name: "Vintage", values: { sepia: 40, brightness: 90, contrast: 85, saturate: 110 } },
  { name: "None", values: FILTERS_LIST.reduce((a, f) => ({ ...a, [f.key]: f.default }), {}) }
];

const buildFilterString = filters =>
  FILTERS_LIST.map(f => `${f.key}(${filters[f.key] ?? f.default}${f.unit})`).join(" ");

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function getDeviceTheme() {
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

const ImageEditor = ({ imageSrc, onSave, onCancel, maxWidth = 900, maxHeight = 700 }) => {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const cropImgRef = useRef(null);

  // Undo/redo for layers, filters, and image source
  const [layersHistory, { set: setLayers, undo: undoLayer, redo: redoLayer, canUndo: canUndoLayer, canRedo: canRedoLayer }] =
    useUndo([{ ...DEFAULT_TEXT, id: uuidv4(), z: 1 }]);
  const layers = layersHistory.present;
  const [filtersHistory, { set: setFilters, undo: undoFilter, redo: redoFilter, canUndo: canUndoFilter, canRedo: canRedoFilter }] =
    useUndo(FILTERS_LIST.reduce((acc, f) => ({ ...acc, [f.key]: f.default }), {}));
  const filters = filtersHistory.present;
  const [imageSrcHistory, { set: setImageSrc, undo: undoImageSrc, redo: redoImageSrc, canUndo: canUndoImageSrc, canRedo: canRedoImageSrc }] =
    useUndo(imageSrc);
  const currentImageSrc = imageSrcHistory.present;

  const [selectedId, setSelectedId] = useState(null);
  const [crop, setCrop] = useState();
  const [cropping, setCropping] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [theme, setTheme] = useState(getDeviceTheme());
  const [canvasDims, setCanvasDims] = useState({ width: maxWidth, height: maxHeight });
  const [imgLoadedDims, setImgLoadedDims] = useState({ width: 0, height: 0 });

  // Modal state for editing tools
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState(null);

  const openModal = (section) => {
    setActiveSection(section);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveSection(null);
  };

  // --- Load Image (initialize crop and dimensions) ---
  useEffect(() => {
    const image = new window.Image();
    image.src = currentImageSrc;
    image.crossOrigin = "anonymous";
    imgRef.current = image;
    image.onload = () => {
      let width = image.width, height = image.height;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      setCanvasDims({ width, height });
      setImgLoadedDims({ width, height });
      setCrop({
        unit: "px",
        x: 0,
        y: 0,
        width,
        height,
        aspect: width / height
      });
      draw(image, width, height);
    };
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onThemeChange = e => setTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", onThemeChange);
    return () => mql.removeEventListener("change", onThemeChange);
  }, [currentImageSrc, maxWidth, maxHeight]);

  useLayoutEffect(() => {
    if (imgRef.current) {
      draw(imgRef.current, canvasDims.width, canvasDims.height);
    }
  }, [filters, layers, stickers, currentImageSrc, canvasDims]);

  function draw(image, width, height) {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!ctx || !image) return;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    ctx.filter = buildFilterString(filters);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.filter = "none";

    stickers.forEach(st => {
      if (!st.img) return;
      ctx.save();
      ctx.globalAlpha = st.alpha ?? 1;
      ctx.drawImage(st.img, st.x, st.y, st.width, st.height);
      ctx.restore();
    });

    layers.filter(l => l.type === "shape").forEach(shape => drawShape(ctx, shape));

    layers.filter(l => l.type !== "shape").forEach(layer => {
      ctx.save();
      let textX = layer.x, textY = layer.y;
      ctx.font = `${layer.bold ? "bold " : ""}${layer.italic ? "italic " : ""}${layer.fontSize}px ${layer.fontFamily}`;
      const textWidth = ctx.measureText(layer.content).width;
      if (layer.align === "center") textX -= textWidth / 2;
      else if (layer.align === "right") textX -= textWidth;
      ctx.translate(textX, textY);
      ctx.rotate((layer.rotation * Math.PI) / 180);

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.globalAlpha = layer.alpha ?? 1;
      ctx.shadowColor = layer.shadow ? "#000a" : "transparent";
      ctx.shadowBlur = layer.shadow ? 6 : 0;
      ctx.lineWidth = 2;

      if (layer.gradient) {
        const grad = ctx.createLinearGradient(0, 0, layer.fontSize * layer.content.length, 0);
        grad.addColorStop(0, layer.gradientFrom);
        grad.addColorStop(1, layer.gradientTo);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = layer.color;
      }

      if (layer.outline) {
        ctx.strokeStyle = "#000";
        ctx.strokeText(layer.content, 0, 0);
      }
      if (layer.underline) {
        const w = ctx.measureText(layer.content).width;
        ctx.beginPath();
        ctx.moveTo(0, layer.fontSize + 2);
        ctx.lineTo(w, layer.fontSize + 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = layer.color;
        ctx.stroke();
      }
      ctx.fillText(layer.content, 0, 0);
      ctx.restore();
    });
  }

  function drawShape(ctx, shape) {
    ctx.save();
    ctx.globalAlpha = shape.alpha ?? 1;
    ctx.strokeStyle = shape.color ?? "#fff";
    ctx.fillStyle = shape.fill ?? "transparent";
    ctx.lineWidth = shape.lineWidth ?? 3;
    switch (shape.shape) {
      case "rect":
        ctx.beginPath();
        ctx.rect(0, 0, shape.w, shape.h);
        ctx.fill();
        ctx.stroke();
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(shape.x, shape.y, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        break;
      case "arrow":
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
        break;
      case "line":
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y);
        ctx.lineTo(shape.x2, shape.y2);
        ctx.stroke();
        break;
      default:
        break;
    }
    ctx.restore();
  }

  // --- Crop ---
  const [cropImg, setCropImg] = useState(null);
  const onCropImgLoaded = useCallback(img => setCropImg(img), []);
  const onCompleteCrop = useCallback(
    (c) => {
      if (!cropImg || !c.width || !c.height) return;
      let cropX = c.x, cropY = c.y, cropW = c.width, cropH = c.height;
      if (c.unit === "px" || !c.unit) {
        // px values; do nothing extra
      } else if (c.unit === "%") {
        cropX = (c.x / 100) * cropImg.width;
        cropY = (c.y / 100) * cropImg.height;
        cropW = (c.width / 100) * cropImg.width;
        cropH = (c.height / 100) * cropImg.height;
      }
      const scaleX = cropImg.naturalWidth / cropImg.width;
      const scaleY = cropImg.naturalHeight / cropImg.height;
      const canvas = document.createElement("canvas");
      canvas.width = cropW * scaleX;
      canvas.height = cropH * scaleY;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        cropImg,
        cropX * scaleX,
        cropY * scaleY,
        cropW * scaleX,
        cropH * scaleY,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const newImageSrc = canvas.toDataURL();
      setImageSrc(newImageSrc);
      setCropping(false);
    },
    [cropImg, setImageSrc]
  );

  // --- Layer manipulation ---
  const addText = () =>
    setLayers([...layers, { ...DEFAULT_TEXT, id: uuidv4(), z: layers.length + 1 }]);
  const updateLayer = (id, props) =>
    setLayers(layers.map(l => (l.id === id ? { ...l, ...props } : l)));
  const removeLayer = (id) => setLayers(layers.filter(l => l.id !== id));
  const duplicateLayer = (id) => {
    const orig = layers.find(l => l.id === id);
    setLayers([
      ...layers,
      { ...orig, id: uuidv4(), x: orig.x + 30, y: orig.y + 30, z: layers.length + 1 }
    ]);
  };
  const moveLayer = (id, dir) => {
    const idx = layers.findIndex(l => l.id === id);
    if (dir === "up" && idx < layers.length - 1) {
      const arr = layers.slice();
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      setLayers(arr);
    }
    if (dir === "down" && idx > 0) {
      const arr = layers.slice();
      [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
      setLayers(arr);
    }
  };

  // --- Stickers/emoji ---
  const addSticker = (file) => {
    const img = new window.Image();
    img.src = URL.createObjectURL(file);
    img.onload = () =>
      setStickers([
        ...stickers,
        { id: uuidv4(), img, x: 100, y: 100, width: 80, height: 80, alpha: 1 }
      ]);
  };
  const addEmoji = (emoji) => {
    setLayers([
      ...layers,
      { ...DEFAULT_TEXT, id: uuidv4(), content: emoji, fontSize: 56, x: 120, y: 120 }
    ]);
  };

  // --- Save & Export ---
  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `edited-image.png`, { type: "image/png" });
    onSave(file);
  };

  const handleExport = (type = "png") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = url;
        a.download = `edited-${Date.now()}.${type}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      },
      `image/${type}`
    );
  };

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          undoLayer();
          undoFilter();
          undoImageSrc();
        }
        if (e.key === "y") {
          e.preventDefault();
          redoLayer();
          redoFilter();
          redoImageSrc();
        }
      }
      if (e.key === "Delete" && selectedId) removeLayer(selectedId);
      if (selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const l = layers.find((l) => l.id === selectedId);
        if (!l) return;
        const dx = e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0;
        const dy = e.key === "ArrowDown" ? 5 : e.key === "ArrowUp" ? -5 : 0;
        updateLayer(selectedId, {
          x: clamp(l.x + dx, 0, canvasDims.width),
          y: clamp(l.y + dy, 0, canvasDims.height)
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, layers, canvasDims.width, canvasDims.height]);

  // New: Custom draggable component for each text layer
  const DraggableTextLayer = ({ layer }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: layer.id,
      disabled: layer.locked,
    });

    const style = {
      position: "absolute",
      transform: `translate(${layer.x}px, ${layer.y}px)${transform ? ` translate(${transform.x}px, ${transform.y}px)` : ""}`,
      zIndex: layer.z,
      cursor: layer.locked ? "not-allowed" : "move",
      pointerEvents: layer.locked ? "none" : "all",
      userSelect: "none",
    };

    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className={`layer-drag-overlay${selectedId === layer.id ? " selected" : ""}`}
        style={style}
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(layer.id);
        }}
      >
        <div
          className="text-layer"
          style={{
            color: layer.color,
            fontSize: layer.fontSize,
            fontFamily: layer.fontFamily,
            fontWeight: layer.bold ? "bold" : "normal",
            fontStyle: layer.italic ? "italic" : "normal",
            textDecoration: layer.underline ? "underline" : "none",
            textAlign: layer.align,
            filter: layer.shadow ? "drop-shadow(0 2px 4px #0006)" : "none",
            textShadow: layer.shadow ? "1px 1px 6px #000a" : "none",
            background: "none",
            cursor: layer.locked ? "not-allowed" : "move",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            padding: "4px",
            transform: `rotate(${layer.rotation}deg) translate(${layer.align === "center" ? "-50%" : layer.align === "right" ? "-100%" : "0"}, 0)`,
          }}
        >
          {layer.content}
        </div>
      </div>
    );
  };

  // --- Render ---
  return (
    <div className={`img-editor-root ${theme}`}>
      <div className="editor-toolbar">
        <button className="toolbar-button" onClick={() => openModal("text")} title="Text Options">✍️ Text</button>
        <button className="toolbar-button" onClick={() => openModal("filter")} title="Filter Options">🎨 Filters</button>
        <button className="toolbar-button" onClick={() => openModal("emoji")} title="Emoji Options">😀 Emojis</button>
        <label className="toolbar-button" title="Add Sticker">
          🖼️
          <input type="file" accept="image/*" onChange={(e) => addSticker(e.target.files[0])} />
        </label>
        <button className="toolbar-button" onClick={() => setCropping(!cropping)}>
          {cropping ? "✅ Done Crop" : "✂️ Crop"}
        </button>
        <button className="toolbar-button" onClick={() => { undoLayer(); undoFilter(); undoImageSrc(); }} disabled={!canUndoLayer && !canUndoFilter && !canUndoImageSrc}>↩️ Undo</button>
        <button className="toolbar-button" onClick={() => { redoLayer(); redoFilter(); redoImageSrc(); }} disabled={!canRedoLayer && !canRedoFilter && !canRedoImageSrc}>↪️ Redo</button>
        <button className="toolbar-button" onClick={handleExport}>⬇️ Export</button>
        <button className="toolbar-button" onClick={handleSave}>🚀 Save</button>
        <button className="toolbar-button" onClick={onCancel}>❌ Cancel</button>
        <button className="toolbar-button" onClick={() => setShowHistory((s) => !s)}>🕒 History</button>
        <span className="spacer" />
        <button className="toolbar-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "🌞" : "🌚"}
        </button>
      </div>
      <div className="img-editor-main">
        <div className="img-canvas-area">
          {cropping ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ReactCrop
                crop={crop}
                onChange={(newCrop) => setCrop(newCrop)}
                onComplete={onCompleteCrop}
                ruleOfThirds
                keepSelection
                minWidth={10}
                minHeight={10}
                crossorigin="anonymous"
                style={{ maxWidth: "100vw", maxHeight: "75vh" }}
              >
                <img
                  ref={cropImgRef}
                  alt="Crop source"
                  src={currentImageSrc}
                  style={{ maxWidth: "100vw", maxHeight: "75vh", display: "block" }}
                  onLoad={(e) => onCropImgLoaded(e.target)}
                />
              </ReactCrop>
            </div>
          ) : (
            <DndContext
              onDragStart={({ active }) => setSelectedId(active.id)}
              onDragEnd={({ active, delta }) => {
                const currentLayer = layers.find((l) => l.id === active.id);
                if (currentLayer) {
                  updateLayer(active.id, {
                    x: clamp(currentLayer.x + delta.x, 0, canvasDims.width),
                    y: clamp(currentLayer.y + delta.y, 0, canvasDims.height),
                  });
                }
              }}
              modifiers={[restrictToParentElement]}
            >
              <div
                className="canvas-wrap"
                style={{
                  position: "relative",
                  width: `${canvasDims.width}px`,
                  height: `${canvasDims.height}px`,
                  margin: "auto",
                }}
              >
                <canvas
                  ref={canvasRef}
                  className="editor-canvas"
                  style={{ width: "100%", height: "100%" }}
                  tabIndex={0}
                />
                {layers
                  .filter((layer) => layer.type !== "shape")
                  .map((layer) => (
                    <DraggableTextLayer key={layer.id} layer={layer} />
                  ))}
              </div>
            </DndContext>
          )}
        </div>
        {isModalOpen && (
          <div className="editing-modal">
            <div className="modal-content">
              {activeSection === "text" && (
                <>
                  <section>
                    <h3>Layers</h3>
                    <ul className="layer-list">
                      {layers.map((layer) => (
                        <li key={layer.id} className={selectedId === layer.id ? "selected" : ""}>
                          <button onClick={() => setSelectedId(layer.id)}>
                            {layer.content?.slice(0, 10) || "Shape"} <small>({layer.id.slice(0, 4)})</small>
                          </button>
                          <button onClick={() => moveLayer(layer.id, "up")} title="Move Up">▲</button>
                          <button onClick={() => moveLayer(layer.id, "down")} title="Move Down">▼</button>
                          <button onClick={() => duplicateLayer(layer.id)} title="Duplicate">⧉</button>
                          <button onClick={() => removeLayer(layer.id)} title="Delete">🗑️</button>
                        </li>
                      ))}
                    </ul>
                    <button onClick={addText}>+ Add Text</button>
                  </section>
                  <section>
                    <h3>Text & Layer Settings</h3>
                    {selectedId &&
                      (() => {
                        const l = layers.find((l) => l.id === selectedId);
                        if (!l) return null;
                        return (
                          <div className="text-settings">
                            <label>
                              Text
                              <input
                                type="text"
                                value={l.content}
                                onChange={(e) => updateLayer(l.id, { content: e.target.value })}
                                disabled={l.locked}
                              />
                            </label>
                            <label>
                              Font
                              <select value={l.fontFamily} onChange={(e) => updateLayer(l.id, { fontFamily: e.target.value })}>
                                <option>Inter</option>
                                <option>Arial</option>
                                <option>Georgia</option>
                                <option>Comic Sans MS</option>
                                <option>Impact</option>
                              </select>
                            </label>
                            <label>
                              Size
                              <input
                                type="number"
                                min={8}
                                max={200}
                                value={l.fontSize}
                                onChange={(e) => updateLayer(l.id, { fontSize: +e.target.value })}
                              />
                            </label>
                            <label>
                              Color
                              <input
                                type="color"
                                value={l.color}
                                onChange={(e) => updateLayer(l.id, { color: e.target.value })}
                              />
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={l.bold}
                                onChange={(e) => updateLayer(l.id, { bold: e.target.checked })}
                              />{" "}
                              Bold
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={l.italic}
                                onChange={(e) => updateLayer(l.id, { italic: e.target.checked })}
                              />{" "}
                              Italic
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={l.underline}
                                onChange={(e) => updateLayer(l.id, { underline: e.target.checked })}
                              />{" "}
                              Underline
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={l.shadow}
                                onChange={(e) => updateLayer(l.id, { shadow: e.target.checked })}
                              />{" "}
                              Shadow
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={l.outline}
                                onChange={(e) => updateLayer(l.id, { outline: e.target.checked })}
                              />{" "}
                              Outline
                            </label>
                            <label>
                              Align
                              <select value={l.align} onChange={(e) => updateLayer(l.id, { align: e.target.value })}>
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                              </select>
                            </label>
                            <label>
                              Rotation
                              <input
                                type="range"
                                min={-180}
                                max={180}
                                value={l.rotation}
                                onChange={(e) => updateLayer(l.id, { rotation: +e.target.value })}
                              />
                              <span>{l.rotation}°</span>
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={l.gradient}
                                onChange={(e) => updateLayer(l.id, { gradient: e.target.checked })}
                              />{" "}
                              Gradient
                            </label>
                            {l.gradient && (
                              <>
                                <input
                                  type="color"
                                  value={l.gradientFrom}
                                  onChange={(e) => updateLayer(l.id, { gradientFrom: e.target.value })}
                                />
                                <input
                                  type="color"
                                  value={l.gradientTo}
                                  onChange={(e) => updateLayer(l.id, { gradientTo: e.target.value })}
                                />
                              </>
                            )}
                            <label>
                              <input
                                type="checkbox"
                                checked={l.locked}
                                onChange={(e) => updateLayer(l.id, { locked: e.target.checked })}
                              />{" "}
                              Lock Layer
                            </label>
                          </div>
                        );
                      })()}
                  </section>
                </>
              )}
              {activeSection === "filter" && (
                <section>
                  <h3>Filters</h3>
                  <div className="filter-presets">
                    {FILTER_PRESETS.map((p) => (
                      <button key={p.name} onClick={() => setFilters({ ...filters, ...p.values })}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {FILTERS_LIST.map((f) => (
                    <label key={f.key} className="filter-slider">
                      <span>{f.name}</span>
                      <input
                        type="range"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={filters[f.key]}
                        onChange={(e) => setFilters({ ...filters, [f.key]: +e.target.value })}
                      />
                      <span>
                        {filters[f.key]}
                        {f.unit}
                      </span>
                    </label>
                  ))}
                </section>
              )}
              {activeSection === "emoji" && (
                <section>
                  <h3>Emoji & Extras</h3>
                  <div className="emoji-list">
                    {["✨", "🔥", "🏆", "😂", "💬", "👾", "🦄", "🌈"].map((e) => (
                      <button key={e} onClick={() => addEmoji(e)}>
                        {e}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => handleExport("png")}>Download PNG</button>
                  <button onClick={() => handleExport("jpeg")}>Download JPEG</button>
                  <button onClick={() => handleExport("webp")}>Download WebP</button>
                </section>
              )}
              <button className="modal-close-btn" onClick={closeModal}>Close</button>
            </div>
          </div>
        )}
        {showHistory && (
          <section>
            <h3>History</h3>
            <ul className="history-list">
              {layersHistory.past.slice(-10).map((_, i) => (
                <li key={i}>Undo {i + 1}</li>
              ))}
              <li>
                <strong>Now</strong>
              </li>
              {layersHistory.future.slice(0, 10).map((_, i) => (
                <li key={i}>Redo {i + 1}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

export default ImageEditor;