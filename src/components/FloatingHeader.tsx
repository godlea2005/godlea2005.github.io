import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { site } from "../content/site";
import type { Theme } from "../lib/theme";
import { ModalSurface } from "./ModalSurface";
import "./floating-header.css";

type FloatingHeaderProps = {
  theme: Theme;
  pageHash: string;
  onToggleTheme: () => void;
};
const destinations = [
  { name: "主页", href: "#top", detail: "文昊的个人空间" },
  {
    name: "AI 电商设计",
    href: "#ai-commerce",
    detail: "产品分析 · 主图方向 · 详情分镜",
  },
  { name: "作品", href: "#archive", detail: "设计作品与项目归档" },
  { name: "文章与笔记", href: "#notes", detail: "实验记录 · 学习与思考" },
  { name: "工具导航", href: "#studio-map", detail: "个人数字工作室" },
  { name: "留言", href: "#guestbook", detail: "留下想法，交流近况" },
  { name: "音乐", href: "#music", detail: "音乐与声音可视化" },
  { name: "联系与关于", href: "#about", detail: "与我取得联系" },
];
export function FloatingHeader({
  theme,
  pageHash,
  onToggleTheme,
}: FloatingHeaderProps) {
  const { isAdmin } = useAuth();
  const rootRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuGroups = [
    {
      label: "文章",
      items: [
        ["实验记录", "#notes"],
        ["工具导航", "#studio-map"],
      ],
    },
    {
      label: "我的",
      items: [
        ["留言", "#guestbook"],
        ["音乐", "#music"],
        ["联系与关于", "#about"],
        ...(isAdmin ? [["管理后台", "#commerce-admin"]] : []),
      ],
    },
  ];
  const searchItems = [
    ...destinations,
    ...(isAdmin
      ? [
          {
            name: "管理后台",
            href: "#commerce-admin",
            detail: "运营与服务管理",
          },
        ]
      : []),
  ];
  const results = searchItems.filter((item) =>
    (item.name + " " + item.detail)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const closeNavigation = () => {
    setActiveMenu(null);
    setMobileOpen(false);
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setActiveMenu(null);
        setMobileOpen(false);
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        rootRef.current
          ?.querySelector<HTMLButtonElement>(
            ".floating-nav-group.is-open > button",
          )
          ?.focus();
        setActiveMenu(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);
  useEffect(() => {
    setActiveMenu(null);
    setMobileOpen(false);
    setSearchOpen(false);
  }, [isAdmin, pageHash]);
  return (
    <>
      <header className="floating-header" ref={rootRef}>
        <a
          className="floating-brand glass-pill"
          href="#top"
          onClick={closeNavigation}
          aria-label="文昊，回到首页"
        >
          <span>W</span>
          <strong>{site.name}</strong>
          <i>.</i>
        </a>
        <nav
          className={
            "floating-nav glass-pill" + (mobileOpen ? " is-mobile-open" : "")
          }
          id="floating-nav"
          aria-label="主导航"
        >
          <div className="floating-nav-primary">
            {[
              ["主页", "#top"],
              ["AI 电商", "#ai-commerce"],
              ["作品", "#archive"],
            ].map(([name, href]) => (
              <a
                key={href}
                className={
                  pageHash === href || (!pageHash && href === "#top")
                    ? "is-current"
                    : ""
                }
                aria-current={
                  pageHash === href || (!pageHash && href === "#top")
                    ? "page"
                    : undefined
                }
                href={href}
                onClick={closeNavigation}
              >
                {name}
              </a>
            ))}
            {menuGroups.map((group) => (
              <div
                key={group.label}
                className={
                  "floating-nav-group" +
                  (activeMenu === group.label ? " is-open" : "")
                }
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setActiveMenu(group.label);
                }}
                onPointerLeave={(event) => {
                  if (
                    event.pointerType === "mouse" &&
                    !event.currentTarget.contains(document.activeElement)
                  )
                    setActiveMenu(null);
                }}
                onBlur={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setActiveMenu(null);
                }}
              >
                <button
                  type="button"
                  className={
                    group.items.some(([, href]) => href === pageHash)
                      ? "is-current"
                      : ""
                  }
                  aria-expanded={activeMenu === group.label}
                  aria-controls={"menu-" + group.label}
                  onClick={() => setActiveMenu(group.label)}
                >
                  {group.label}
                  <i aria-hidden="true">⌄</i>
                </button>
                {activeMenu === group.label && (
                  <div className="floating-dropdown" id={"menu-" + group.label}>
                    {group.items.map(([name, href]) => (
                      <a key={name} href={href} onClick={closeNavigation}>
                        {name}
                        <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>
        <div className="floating-actions glass-pill">
          <button
            className="floating-search"
            type="button"
            onClick={() => {
              setQuery("");
              setSearchOpen(true);
            }}
            aria-label="打开搜索"
          >
            <span aria-hidden="true">⌕</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className="floating-theme"
            type="button"
            onClick={onToggleTheme}
            aria-label={
              "切换至" + (theme === "dark" ? "浅色" : "深色") + "模式"
            }
          >
            <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
          </button>
          <button
            className="floating-menu-toggle"
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="floating-nav"
          >
            {mobileOpen ? "关闭" : "目录"}
          </button>
        </div>
      </header>
      {searchOpen && (
        <ModalSurface
          className="site-search-layer"
          label="搜索本站"
          onClose={() => setSearchOpen(false)}
        >
          <header>
            <h2>去哪里看看？</h2>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="关闭搜索"
            >
              ×
            </button>
          </header>
          <input
            data-modal-focus
            aria-label="搜索作品、笔记或标签"
            placeholder="搜索作品、笔记、工具…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="site-search-count" role="status">
            {results.length
              ? results.length + " 个站内入口"
              : "没有找到匹配入口，试试“作品”或“电商”。"}
          </p>
          <ul>
            {results.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={() => setSearchOpen(false)}>
                  <strong>{item.name}</strong>
                  <span>{item.detail}</span>
                  <i aria-hidden="true">↗</i>
                </a>
              </li>
            ))}
          </ul>
          <small>Esc 关闭 · Tab 切换 · Enter 前往</small>
        </ModalSurface>
      )}
    </>
  );
}
