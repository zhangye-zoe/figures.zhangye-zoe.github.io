document.addEventListener("DOMContentLoaded", () => {
  /* ========== 1. 根据 window.figureList 生成缩略图 ========== */
  const thumbListContainer = document.getElementById("thumbList");
  if (thumbListContainer && window.figureList && window.figureList.length) {
    const frag = document.createDocumentFragment();

    window.figureList.forEach((fig) => {
      const item = document.createElement("div");
      item.className = "thumb-item";

      // 基础属性
      item.setAttribute("data-full", fig.file);
      item.setAttribute("data-title", fig.titleFull || "Figure");
      item.setAttribute("data-meta", fig.meta || "");
      item.setAttribute("data-tag-primary", fig.tagPrimary || "");
      item.setAttribute("data-tag-secondary", fig.tagSecondary || "");
      item.setAttribute("data-venue", fig.venue || "");
      item.setAttribute("data-topic", fig.topic || "");
      item.setAttribute("data-id", fig.id || "");

      // paper 相关：尽量兼容不同字段
      const paperId =
        fig.paperId ||
        fig.paper_id ||
        fig.paperKey ||
        fig.paper ||
        "";
      const paperTitle =
        fig.paperTitle ||
        fig.paper_title ||
        fig.paperName ||
        fig.paper ||
        "";

      if (paperId) {
        item.setAttribute("data-paper", paperId);
      }
      if (paperTitle) {
        item.setAttribute("data-paper-title", paperTitle);
      }

      // 缩略图
      const imgWrap = document.createElement("div");
      imgWrap.className = "thumb-image-wrap";
      const img = document.createElement("img");
      img.src = fig.file;
      img.alt = fig.titleShort || fig.titleFull || "Figure";
      img.loading = "lazy";
      imgWrap.appendChild(img);
      item.appendChild(imgWrap);

      // 文本信息
      const metaWrap = document.createElement("div");
      metaWrap.className = "thumb-meta";

      const titleDiv = document.createElement("div");
      titleDiv.className = "thumb-title";
      titleDiv.textContent = fig.titleShort || fig.titleFull || "Figure";
      metaWrap.appendChild(titleDiv);

      const descDiv = document.createElement("div");
      descDiv.className = "thumb-desc";
      descDiv.textContent = fig.desc || "";
      metaWrap.appendChild(descDiv);

      item.appendChild(metaWrap);

      if (fig.badge) {
        const badge = document.createElement("span");
        badge.className = "thumb-badge";
        badge.textContent = fig.badge;
        item.appendChild(badge);
      }

      frag.appendChild(item);
    });

    thumbListContainer.appendChild(frag);
  }

  const thumbItems = Array.from(document.querySelectorAll(".thumb-item"));

  /* ========== 2. 基本 DOM 引用 ========== */
  const mainImage = document.getElementById("mainImage");
  const viewerTitle = document.getElementById("viewerTitle");
  const viewerMeta = document.getElementById("viewerMeta");
  const viewerProgress = document.getElementById("viewerProgress");
  const tagPrimary = document.getElementById("tagPrimary");
  const tagSecondary = document.getElementById("tagSecondary");
  const notesTextarea = document.getElementById("figureNotes");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const viewToggleButtons = document.querySelectorAll(".view-toggle-btn");
  const categoryListEl = document.getElementById("categoryList");
  const categoryMainTitle = document.getElementById("categoryMainTitle");

  const appShell = document.querySelector(".app-shell");
  const sidebar = document.querySelector(".sidebar");
  const sidebarResizer = document.getElementById("sidebarResizer");

  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  const imageFrame = document.getElementById("imageFrame");
  const magnifierLens = document.getElementById("magnifierLens");

  const modeButtons = document.querySelectorAll(".mode-btn");

  /* ========== 3. 状态变量 ========== */
  let interactionMode = "click";
  let currentIndex = -1;
  let currentView = "venue";   // "venue" | "topic"
  let activeCategory = "All";  // 顶层过滤：venue/topic；"All" 表示不过滤
  let activePaper = "All";     // venue 下 paper 过滤

  // 不想当成研究领域的 topic
  const TOPIC_EXCLUDE = new Set([
    "Performance",
    "Ablation",
    "Evaluation",
    "Others",
    "Misc"
  ]);

  /* === localStorage: notes 持久化 === */
  const STORAGE_KEY = "ye_figure_notes_v1";

  function loadNotesStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const map = new Map();
      Object.entries(obj).forEach(([k, v]) => map.set(k, v));
      return map;
    } catch (e) {
      console.warn("Failed to load notes from storage", e);
      return new Map();
    }
  }

  function saveNotesStore() {
    try {
      const obj = Object.fromEntries(notesStore.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn("Failed to save notes to storage", e);
    }
  }

  const notesStore = loadNotesStore();

  function getKeyForIndex(index) {
    const item = thumbItems[index];
    if (!item) return String(index);
    const id = item.getAttribute("data-id");
    return id || String(index);
  }

  function getVisibleItems() {
    return thumbItems.filter((item) => item.style.display !== "none");
  }

  /* ========== 4. 图像缩放 & 放大镜 ========= */

  let currentZoom = 1;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.25;
  const LENS_SCALE = 2;

  function applyZoom() {
    if (!mainImage) return;
    mainImage.style.transform = `scale(${currentZoom})`;
    mainImage.style.transformOrigin = "center center";
    updateMagnifierBackground();
  }

  function updateZoom(delta) {
    let next = currentZoom + delta;
    next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    currentZoom = next;
    applyZoom();
  }

  zoomInBtn?.addEventListener("click", () => updateZoom(ZOOM_STEP));
  zoomOutBtn?.addEventListener("click", () => updateZoom(-ZOOM_STEP));
  zoomResetBtn?.addEventListener("click", () => {
    currentZoom = 1;
    applyZoom();
    // 重置滚动位置，避免图片顶部被「挡住」
    if (imageFrame) {
      imageFrame.scrollTop = 0;
      imageFrame.scrollLeft = 0;
    }
  });

  mainImage.addEventListener("load", () => {
    applyZoom();
  });

  function updateMagnifierBackground() {
    if (!mainImage.src || !magnifierLens) return;
    const imgRect = mainImage.getBoundingClientRect();
    const bgWidth = imgRect.width * LENS_SCALE * currentZoom;
    const bgHeight = imgRect.height * LENS_SCALE * currentZoom;
    magnifierLens.style.backgroundImage = `url(${mainImage.src})`;
    magnifierLens.style.backgroundSize = `${bgWidth}px ${bgHeight}px`;
  }

  function moveLens(e) {
    if (!mainImage.src) return;
    const frameRect = imageFrame.getBoundingClientRect();
    const imgRect = mainImage.getBoundingClientRect();
    const lensRect = magnifierLens.getBoundingClientRect();

    let x = e.clientX - frameRect.left;
    let y = e.clientY - frameRect.top;

    const lensHalfW = lensRect.width / 2;
    const lensHalfH = lensRect.height / 2;

    x = Math.max(lensHalfW, Math.min(frameRect.width - lensHalfW, x));
    y = Math.max(lensHalfH, Math.min(frameRect.height - lensHalfH, y));

    magnifierLens.style.left = `${x - lensHalfW}px`;
    magnifierLens.style.top = `${y - lensHalfH}px`;

    const relX = (x - (imgRect.left - frameRect.left)) / imgRect.width;
    const relY = (y - (imgRect.top - frameRect.top)) / imgRect.height;

    const bgW = imgRect.width * LENS_SCALE * currentZoom;
    const bgH = imgRect.height * LENS_SCALE * currentZoom;

    const bgX = -relX * (bgW - lensRect.width);
    const bgY = -relY * (bgH - lensRect.height);

    magnifierLens.style.backgroundPosition = `${bgX}px ${bgY}px`;
  }

  if (imageFrame && magnifierLens) {
    imageFrame.addEventListener("mouseenter", () => {
      if (!mainImage.src) return;
      if (interactionMode !== "zoom") {
        magnifierLens.style.display = "none";
        return;
      }
      magnifierLens.style.display = "block";
      updateMagnifierBackground();
    });

    imageFrame.addEventListener("mouseleave", () => {
      magnifierLens.style.display = "none";
      isPanning = false;
      imageFrame.classList.remove("panning");
    });

    imageFrame.addEventListener("mousemove", (e) => {
      if (interactionMode === "zoom") {
        moveLens(e);
      }
    });
  }

  /* ========== 5. Drag 模式：按住左键拖拽平移 ========= */
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let startScrollTop = 0;

  if (imageFrame) {
    imageFrame.addEventListener("mousedown", (e) => {
      if (interactionMode !== "drag") return;
      if (e.button !== 0) return;

      isPanning = true;
      imageFrame.classList.add("panning");
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = imageFrame.scrollLeft;
      startScrollTop = imageFrame.scrollTop;
      e.preventDefault();
    });
  }

  document.addEventListener("mousemove", (e) => {
    if (!isPanning || interactionMode !== "drag") return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    imageFrame.scrollLeft = startScrollLeft - dx;
    imageFrame.scrollTop = startScrollTop - dy;
  });

  document.addEventListener("mouseup", () => {
    if (!isPanning) return;
    isPanning = false;
    imageFrame.classList.remove("panning");
  });

  function setInteractionMode(mode) {
    interactionMode = mode;

    modeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
    });

    if (!imageFrame) return;
    imageFrame.classList.remove("mode-click", "mode-zoom", "mode-drag");
    imageFrame.classList.add(`mode-${mode}`);

    if (magnifierLens) {
      magnifierLens.style.display = "none";
    }
    isPanning = false;
    imageFrame.classList.remove("panning");
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-mode");
      if (!mode) return;
      setInteractionMode(mode);
    });
  });

  setInteractionMode("click");

  /* ========== 6. Sidebar 拖拽调整宽度 ========= */
  let isResizingSidebar = false;

  sidebarResizer?.addEventListener("mousedown", (e) => {
    isResizingSidebar = true;
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizingSidebar || !appShell || !sidebar) return;
    const shellRect = appShell.getBoundingClientRect();
    const minWidth = 260;
    const maxWidth = shellRect.width - 260;
    let newWidth = e.clientX - shellRect.left;
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    sidebar.style.width = `${newWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizingSidebar) {
      isResizingSidebar = false;
      document.body.style.cursor = "";
    }
  });

  /* ========== 7. 过滤逻辑 ========= */

  function applyFilter() {
    thumbItems.forEach((item) => {
      const venue = (item.getAttribute("data-venue") || "").trim();
      const topic = (item.getAttribute("data-topic") || "").trim();
      const paper = (item.getAttribute("data-paper") || "").trim();
      const paperTitle = (item.getAttribute("data-paper-title") || "").trim();

      let matchTop;
      if (currentView === "venue") {
        matchTop = activeCategory === "All" || venue === activeCategory;
      } else {
        matchTop = activeCategory === "All" || topic === activeCategory;
      }

      let matchPaper = true;
      if (currentView === "venue" && activePaper !== "All") {
        // paperId 或 paperTitle 任何一个匹配都算
        matchPaper =
          (paper && paper === activePaper) ||
          (paperTitle && paperTitle === activePaper);
      }

      const match = matchTop && matchPaper;
      item.style.display = match ? "" : "none";
    });

    const visible = getVisibleItems();

    if (visible.length === 0) {
      mainImage.src = "";
      viewerTitle.textContent = "No figures in this category";
      viewerMeta.textContent = "";
      tagPrimary.textContent = "—";
      tagSecondary.textContent = "—";
      viewerProgress.textContent = "0 / 0";
      notesTextarea.value = "";
      currentIndex = -1;
      return;
    }

    if (currentIndex < 0 || !visible.includes(thumbItems[currentIndex])) {
      const firstVisible = visible[0];
      const newIndex = thumbItems.indexOf(firstVisible);
      updateViewer(newIndex, false);
    } else {
      updateViewer(currentIndex, false);
    }
  }

  function updateViewer(index, scrollIntoView = true) {
    if (index < 0 || index >= thumbItems.length) return;
    const item = thumbItems[index];
    if (item.style.display === "none") return;

    thumbItems.forEach((it, i) => {
      it.classList.toggle("active", i === index);
    });

    const fullSrc = item.getAttribute("data-full");
    const title = item.getAttribute("data-title") || "Figure";
    const meta = item.getAttribute("data-meta") || "";
    const primary = item.getAttribute("data-tag-primary") || "Figure";
    const secondary = item.getAttribute("data-tag-secondary") || "—";

    currentZoom = 1;

    mainImage.src = fullSrc;
    mainImage.alt = title;
    viewerTitle.textContent = title;
    viewerMeta.textContent = meta;
    tagPrimary.textContent = primary;
    tagSecondary.textContent = secondary;

    // 每次切图，把滚动位置恢复到顶部
    if (imageFrame) {
      imageFrame.scrollTop = 0;
      imageFrame.scrollLeft = 0;
    }

    const visible = getVisibleItems();
    const rank = visible.indexOf(item) + 1;
    viewerProgress.textContent = visible.length
      ? `${rank} / ${visible.length}`
      : "0 / 0";

    currentIndex = index;

    const key = getKeyForIndex(index);
    notesTextarea.value = notesStore.get(key) || "";

    if (scrollIntoView) {
      item.scrollIntoView({
        block: "nearest",
        inline: "nearest"
      });
    }
  }

  thumbItems.forEach((item, index) => {
    item.addEventListener("click", () => {
      updateViewer(index, false);
    });
  });

  function findNextVisible(startIndex, direction) {
    if (thumbItems.length === 0) return -1;
    let index = startIndex;
    for (let i = 0; i < thumbItems.length; i++) {
      index = (index + direction + thumbItems.length) % thumbItems.length;
      if (thumbItems[index].style.display !== "none") {
        return index;
      }
    }
    return startIndex;
  }

  function goPrev() {
    if (currentIndex === -1) return;
    const nextIndex = findNextVisible(currentIndex, -1);
    updateViewer(nextIndex);
  }

  function goNext() {
    if (currentIndex === -1) return;
    const nextIndex = findNextVisible(currentIndex, 1);
    updateViewer(nextIndex);
  }

  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  });

  notesTextarea.addEventListener("input", () => {
    if (currentIndex < 0) return;
    const key = getKeyForIndex(currentIndex);
    notesStore.set(key, notesTextarea.value);
    saveNotesStore();
  });

  /* ========== 8. 目录构建 & 状态 ========= */

  function refreshCategoryActiveStates() {
    const categoryItems = categoryListEl.querySelectorAll(".category-item");
    categoryItems.forEach((btn) => {
      const value = btn.getAttribute("data-value");
      const isActive =
        (activeCategory === "All" && value === "All") ||
        (activeCategory !== "All" && value === activeCategory);
      btn.classList.toggle("active", isActive);
    });

    const paperItems = categoryListEl.querySelectorAll(".paper-item");
    paperItems.forEach((btn) => {
      const pKey = btn.getAttribute("data-paper-key");
      const isActive =
        currentView === "venue" &&
        activePaper !== "All" &&
        pKey === activePaper;
      btn.classList.toggle("active", isActive);
    });

    // 顶部标题 All venues / All topics 的激活状态
    if (categoryMainTitle) {
      categoryMainTitle.classList.toggle("active", activeCategory === "All");
    }
  }

  function buildCategories() {
    categoryListEl.innerHTML = "";

    /* ---- Topic 视图 ---- */
    if (currentView === "topic") {
      if (categoryMainTitle) categoryMainTitle.textContent = "All topics";

      const topicCount = new Map();

      thumbItems.forEach((item) => {
        const topic = (item.getAttribute("data-topic") || "").trim();
        if (!topic) return;
        if (TOPIC_EXCLUDE.has(topic)) return;
        topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
      });

      const names = Array.from(topicCount.keys()).sort();
      names.forEach((name) => {
        const btn = document.createElement("button");
        btn.className = "category-item";
        btn.setAttribute("data-value", name);
        btn.innerHTML = `
          <span class="category-title">${name}</span>
          <span class="category-item-count">${topicCount.get(name)}</span>
        `;
        categoryListEl.appendChild(btn);
      });

      refreshCategoryActiveStates();
      return;
    }

    /* ---- Venue 视图 ---- */
    if (categoryMainTitle) categoryMainTitle.textContent = "All venues";

    const venueMap = new Map();
    thumbItems.forEach((item) => {
      const venue = (item.getAttribute("data-venue") || "Unknown").trim();
      const paperId = (item.getAttribute("data-paper") || "").trim();
      const paperTitle = (item.getAttribute("data-paper-title") || "").trim();

      if (!venueMap.has(venue)) {
        venueMap.set(venue, {
          count: 0,
          papers: new Map()
        });
      }
      const venueEntry = venueMap.get(venue);
      venueEntry.count++;

      // paperKey：优先用 paperId，否则用 paperTitle，否则 fallback
      const paperKey = paperId || (paperTitle ? paperTitle : "__noPaper__");
      const finalTitle = paperTitle || paperId || "Untitled figure set";

      if (!venueEntry.papers.has(paperKey)) {
        venueEntry.papers.set(paperKey, {
          title: finalTitle,
          count: 0
        });
      }
      venueEntry.papers.get(paperKey).count++;
    });

    const sortedVenues = Array.from(venueMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    sortedVenues.forEach(([venueName, entry]) => {
      const group = document.createElement("div");
      group.className = "category-venue-group";

      const venueBtn = document.createElement("button");
      venueBtn.className = "category-item";
      venueBtn.setAttribute("data-value", venueName);
      venueBtn.setAttribute("data-collapsed", "true"); // 默认折叠
      venueBtn.innerHTML = `
        <span class="category-main-label">
          <span class="category-chevron">▾</span>
          <span class="category-title">${venueName}</span>
        </span>
        <span class="category-item-count">${entry.count}</span>
      `;
      group.appendChild(venueBtn);

      const paperListEl = document.createElement("div");
      paperListEl.className = "paper-list";
      paperListEl.style.display = "none";

      const sortedPapers = Array.from(entry.papers.entries()).sort(
        (a, b) => a[1].title.localeCompare(b[1].title)
      );

      sortedPapers.forEach(([paperKey, paperInfo]) => {
        const paperBtn = document.createElement("button");
        paperBtn.type = "button";
        paperBtn.className = "paper-item";
        paperBtn.setAttribute("data-venue", venueName);
        paperBtn.setAttribute("data-paper-key", paperKey);
        paperBtn.innerHTML = `
          <span class="paper-title">${paperInfo.title}</span>
          <span class="paper-item-count">${paperInfo.count}</span>
        `;
        paperListEl.appendChild(paperBtn);
      });

      group.appendChild(paperListEl);
      categoryListEl.appendChild(group);
    });

    refreshCategoryActiveStates();
  }

  // 点击 "All venues" / "All topics"：恢复显示所有图
  if (categoryMainTitle) {
    categoryMainTitle.addEventListener("click", () => {
      activeCategory = "All";
      activePaper = "All";
      refreshCategoryActiveStates();
      applyFilter();
    });
  }

  /* ========== 9. 目录点击（折叠/过滤） ========= */

  categoryListEl.addEventListener("click", (e) => {
    const chevron = e.target.closest(".category-chevron");
    const paperBtn = e.target.closest(".paper-item");
    const categoryBtn = e.target.closest(".category-item");

    // 1）点击 paper：过滤到某篇文章
    if (paperBtn) {
      const paperKey = paperBtn.getAttribute("data-paper-key");
      if (!paperKey) return;

      activePaper = paperKey;
      const venueName = paperBtn.getAttribute("data-venue") || "All";
      activeCategory = venueName;

      refreshCategoryActiveStates();
      applyFilter();
      return;
    }

    // 2）Venue 视图：点击箭头或整条 venue
    if (chevron || (categoryBtn && currentView === "venue")) {
      const venueRow = chevron
        ? chevron.closest(".category-item")
        : categoryBtn;
      if (!venueRow) return;

      const value = venueRow.getAttribute("data-value");
      if (!value) return;

      const group = venueRow.closest(".category-venue-group");
      const paperListEl = group?.querySelector(".paper-list");

      // 折叠/展开
      if (paperListEl) {
        const isCollapsed = paperListEl.style.display === "none";
        paperListEl.style.display = isCollapsed ? "" : "none";
        venueRow.setAttribute("data-collapsed", isCollapsed ? "false" : "true");
      }

      // 设置过滤
      activeCategory = value;
      activePaper = "All";
      refreshCategoryActiveStates();
      applyFilter();
      return;
    }

    // 3）Topic 视图：点击 topic 行
    if (categoryBtn && currentView === "topic") {
      const value = categoryBtn.getAttribute("data-value");
      if (!value) return;
      activeCategory = value;
      activePaper = "All";
      refreshCategoryActiveStates();
      applyFilter();
    }
  });

  /* ========== 10. 视图切换（By venue / By topic） ========== */

  viewToggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (!view || view === currentView) return;

      currentView = view;
      activeCategory = "All";
      activePaper = "All";

      viewToggleButtons.forEach((b) =>
        b.classList.toggle("active", b.getAttribute("data-view") === view)
      );

      buildCategories();
      applyFilter();
    });
  });

  /* ========== 11. 初始化 ========== */

  buildCategories();
  applyFilter();

  const visible = getVisibleItems();
  if (visible.length > 0) {
    const firstVisible = visible[0];
    const idx = thumbItems.indexOf(firstVisible);
    updateViewer(idx, false);
  } else {
    viewerProgress.textContent = "0 / 0";
  }
});
