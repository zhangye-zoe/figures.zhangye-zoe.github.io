document.addEventListener("DOMContentLoaded", () => {
  const thumbItems = Array.from(document.querySelectorAll(".thumb-item"));

  const mainImage = document.getElementById("mainImage");
  const viewerTitle = document.getElementById("viewerTitle");
  const viewerMeta = document.getElementById("viewerMeta");
  const viewerProgress = document.getElementById("viewerProgress");
  const tagPrimary = document.getElementById("tagPrimary");
  const tagSecondary = document.getElementById("tagSecondary");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const notesTextarea = document.getElementById("figureNotes");

  const viewToggleButtons = document.querySelectorAll(".view-toggle-btn");
  const categoryListEl = document.getElementById("categoryList");

  let currentIndex = -1;
  let currentView = "venue";   // "venue" | "topic"
  let activeCategory = "All";  // 当前选中的目录项

  /* === localStorage: notes 持久化 === */
  const STORAGE_KEY = "ye_figure_notes_v1";

  function loadNotesStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Map();
      const obj = JSON.parse(raw);
      const map = new Map();
      Object.entries(obj).forEach(([k, v]) => {
        map.set(k, v);
      });
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

  /* === 根据 currentView + activeCategory 过滤 === */
  function applyFilter() {
    thumbItems.forEach((item) => {
      const venue = item.getAttribute("data-venue") || "";
      const topic = item.getAttribute("data-topic") || "";

      const categoryValue =
        currentView === "venue" ? venue : topic;

      const match =
        activeCategory === "All" || categoryValue === activeCategory;

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

    if (
      currentIndex < 0 ||
      !visible.includes(thumbItems[currentIndex])
    ) {
      const firstVisible = visible[0];
      const newIndex = thumbItems.indexOf(firstVisible);
      updateViewer(newIndex, false);
    } else {
      updateViewer(currentIndex, false);
    }
  }

  /* === 更新右侧大图 === */
  function updateViewer(index, scrollIntoView = true) {
    if (index < 0 || index >= thumbItems.length) return;
    const item = thumbItems[index];
    if (item.style.display === "none") return;

    // active 缩略图
    thumbItems.forEach((it, i) => {
      it.classList.toggle("active", i === index);
    });

    const fullSrc = item.getAttribute("data-full");
    const title = item.getAttribute("data-title") || "Figure";
    const meta = item.getAttribute("data-meta") || "";
    const primary = item.getAttribute("data-tag-primary") || "Figure";
    const secondary =
      item.getAttribute("data-tag-secondary") || "—";

    mainImage.src = fullSrc;
    mainImage.alt = title;
    viewerTitle.textContent = title;
    viewerMeta.textContent = meta;
    tagPrimary.textContent = primary;
    tagSecondary.textContent = secondary;

    const visible = getVisibleItems();
    const rank = visible.indexOf(item) + 1;
    viewerProgress.textContent = visible.length
      ? `${rank} / ${visible.length}`
      : "0 / 0";

    currentIndex = index;

    // notes
    const key = getKeyForIndex(index);
    notesTextarea.value = notesStore.get(key) || "";

    if (scrollIntoView) {
      item.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  }

  // 点击缩略图
  thumbItems.forEach((item, index) => {
    item.addEventListener("click", () => {
      updateViewer(index, false);
    });
  });

  /* === 在当前过滤的可见列表里循环寻找上一张/下一张 === */
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

  // 键盘左右键
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  });

  // notes 保存到 localStorage
  notesTextarea.addEventListener("input", () => {
    if (currentIndex < 0) return;
    const key = getKeyForIndex(currentIndex);
    notesStore.set(key, notesTextarea.value);
    saveNotesStore();
  });

  /* === 构建目录：根据 venue 或 topic === */
  function buildCategories() {
    const categoryCount = new Map(); // {Name: count}

    thumbItems.forEach((item) => {
      const venue = item.getAttribute("data-venue");
      const topic = item.getAttribute("data-topic");
      const val = currentView === "venue" ? venue : topic;
      if (!val) return;
      categoryCount.set(val, (categoryCount.get(val) || 0) + 1);
    });

    categoryListEl.innerHTML = "";

    // All
    const totalVisible = thumbItems.length;
    const allBtn = document.createElement("button");
    allBtn.className = "category-item";
    if (activeCategory === "All") {
      allBtn.classList.add("active");
    }
    allBtn.setAttribute("data-value", "All");
    allBtn.innerHTML = `
      <span>All</span>
      <span class="category-item-count">${totalVisible}</span>
    `;
    categoryListEl.appendChild(allBtn);

    // 其他分类（按字母顺序排一下）
    const names = Array.from(categoryCount.keys()).sort();
    names.forEach((name) => {
      const btn = document.createElement("button");
      btn.className = "category-item";
      if (activeCategory === name) {
        btn.classList.add("active");
      }
      btn.setAttribute("data-value", name);
      btn.innerHTML = `
        <span>${name}</span>
        <span class="category-item-count">${categoryCount.get(name)}</span>
      `;
      categoryListEl.appendChild(btn);
    });
  }

  // 点击目录项：切换 activeCategory + 过滤
  categoryListEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".category-item");
    if (!btn) return;
    const value = btn.getAttribute("data-value");
    if (!value) return;

    activeCategory = value;

    categoryListEl.querySelectorAll(".category-item").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });

    applyFilter();
  });

  // 视图切换（venue / topic）
  viewToggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (!view || view === currentView) return;

      currentView = view;
      // 切视图时，默认回到 All
      activeCategory = "All";

      viewToggleButtons.forEach((b) =>
        b.classList.toggle(
          "active",
          b.getAttribute("data-view") === view
        )
      );

      buildCategories();
      applyFilter();
    });
  });

  // 初始化
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
