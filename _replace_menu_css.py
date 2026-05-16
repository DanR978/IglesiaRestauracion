from pathlib import Path

path = Path(r"c:\Users\danya\OneDrive\Desktop\HTML_CSS\IglesiaRestauracion\css\sections\header.css")
text = path.read_text(encoding="utf-8")
lines = text.split("\n")

new_block = r'''/* MOBILE MENU - nested panes, true horizontal swipe.   (max-width: 768px)
   Pattern: Southland Christian / iOS Settings.
   - Root pane shows category names only
   - Tapping a category slides root out left, sub-pane in from right
   - Back button returns to root */
@media (max-width: 768px) {

  /* Burger button */
  .burger {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 36px;
    height: 36px;
    padding: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
    z-index: var(--z-max);
    -webkit-tap-highlight-color: transparent;
  }

  .burger:focus-visible {
    outline: 2px solid var(--color-secondary);
    outline-offset: 4px;
    border-radius: 4px;
  }

  .burger .bar {
    width: 26px;
    height: 2px;
    background: var(--color-white);
    border-radius: 999px;
    transform-origin: center;
    transition: transform 0.32s cubic-bezier(.65,.05,.36,1), opacity 0.22s ease, background-color 0.25s ease;
  }

  .burger.open {
    position: fixed;
    top: calc(var(--pd-md) + env(safe-area-inset-top));
    right: var(--pd-md);
    z-index: calc(var(--z-modal, 100) + 10);
  }

  .burger.open .bar { background: var(--color-primary, #345a65); }
  .burger.open .bar:nth-child(1) { transform: translateY(8px) rotate(45deg); }
  .burger.open .bar:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .burger.open .bar:nth-child(3) { transform: translateY(-8px) rotate(-45deg); }

  .nav-container:has(.burger.open) { transform: none !important; }

  .nav-container:has(.burger.open) .logo {
    position: relative;
    z-index: calc(var(--z-modal, 100) + 10);
    color: var(--color-primary, #345a65);
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    transition: color 0.3s ease;
  }

  /* Panel: pure white, slides in from the right */
  .nav {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 100);
    margin: 0;
    background: #ffffff;
    color: var(--color-primary, #345a65);
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    pointer-events: none;
    will-change: transform;
    transition: transform 0.32s cubic-bezier(.4, 0, .2, 1);
    overflow: hidden;
    padding: 0;
  }

  .nav.open {
    transform: translateX(0);
    pointer-events: auto;
  }

  /* Break menu-item containing block so submenus attach to .nav */
  .menu-item.has-submenu { position: static; }

  /* Root pane content slides as one when a sub-pane opens */
  .menu,
  .menu-donate {
    transition: transform 0.32s cubic-bezier(.4, 0, .2, 1);
    will-change: transform;
  }

  .nav.has-open-submenu .menu,
  .nav.has-open-submenu .menu-donate {
    transform: translateX(-100%);
    pointer-events: none;
  }

  .menu {
    list-style: none;
    margin: 0;
    padding: calc(5.25rem + env(safe-area-inset-top)) 1.6rem 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .menu-item { width: 100%; padding: 0; color: var(--color-primary); }

  /* Category row */
  .accordion-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    width: 100%;
    margin: 0;
    padding: 1rem 0;
    background: transparent;
    border: 0;
    color: var(--color-primary, #345a65);
    font-family: var(--font-Signika, inherit);
    font-size: 1.7rem;
    font-weight: var(--fw-bold);
    line-height: 1.15;
    letter-spacing: -0.005em;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    pointer-events: auto;
    transition: color 0.22s ease;
  }

  .accordion-toggle:hover,
  .accordion-toggle:focus-visible,
  .accordion-toggle:active { color: var(--color-secondary, #d98c59); }

  .accordion-toggle .chevron-icon {
    display: block;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: rgba(52, 90, 101, 0.40);
    transition: color 0.22s ease, transform 0.22s ease;
  }

  .accordion-toggle:hover .chevron-icon,
  .accordion-toggle:focus-visible .chevron-icon,
  .accordion-toggle:active .chevron-icon {
    color: var(--color-secondary);
    transform: translateX(3px);
  }

  /* DONAR pill */
  .menu-donate {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 2.5rem 0 0;
    padding: 0 1.6rem calc(2rem + env(safe-area-inset-bottom));
  }

  .menu-donate .ird-btn--donate {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    width: 100%;
    max-width: none;
    padding: 1.05rem 1.5rem;
    border: 0;
    border-radius: 999px;
    background: var(--color-secondary, #d98c59);
    color: var(--color-white);
    font-size: 0.95rem;
    font-weight: var(--fw-bold);
    letter-spacing: 0.18em;
    text-align: center;
    text-decoration: none;
    box-shadow: 0 12px 32px rgba(217, 140, 89, 0.32);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .menu-donate .ird-btn--donate::after {
    content: "->";
    font-size: 1.05rem;
    transition: transform 0.2s ease;
  }

  .menu-donate .ird-btn--donate:hover,
  .menu-donate .ird-btn--donate:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 16px 40px rgba(217, 140, 89, 0.42);
    color: var(--color-white);
    text-decoration: none;
  }

  .menu-donate .ird-btn--donate:hover::after { transform: translateX(4px); }

  /* Sub-pane: absolute child of .nav, slides in from right */
  .submenu {
    position: absolute;
    inset: 0;
    z-index: 2;
    margin: 0;
    list-style: none;
    background: #ffffff;
    color: var(--color-primary, #345a65);
    transform: translateX(100%);
    transition: transform 0.32s cubic-bezier(.4, 0, .2, 1);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: calc(5.25rem + env(safe-area-inset-top)) 1.6rem calc(2rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    opacity: 1;
    pointer-events: none;
    max-width: 100%;
    min-width: 0;
    max-height: none;
    will-change: transform;
  }

  .menu-item.is-open .submenu {
    transform: translateX(0);
    pointer-events: auto;
  }

  .submenu li { list-style: none; width: 100%; }

  /* Back row */
  .submenu .submenu__head {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    margin: 0 0 1.75rem;
    padding: 0;
  }

  .submenu-back {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.4rem 0.3rem 0.4rem 0;
    background: transparent;
    border: 0;
    color: var(--color-primary, #345a65);
    font-family: inherit;
    font-size: 0.72rem;
    font-weight: var(--fw-bold);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: color 0.22s ease;
  }

  .submenu-back i {
    color: var(--color-secondary, #d98c59);
    font-size: 0.8rem;
    transition: transform 0.22s ease;
  }

  .submenu-back:hover,
  .submenu-back:focus-visible,
  .submenu-back:active { color: var(--color-secondary, #d98c59); }
  .submenu-back:hover i,
  .submenu-back:focus-visible i,
  .submenu-back:active i { transform: translateX(-4px); }

  .submenu__title {
    font-family: var(--font-Signika, inherit);
    font-size: 0.72rem;
    font-weight: var(--fw-bold);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(52, 90, 101, 0.55);
    position: relative;
    padding-left: 1rem;
  }

  .submenu__title::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 1rem;
    background: rgba(52, 90, 101, 0.18);
  }

  /* Sub-pane items */
  .submenu li:not(.submenu__head) a {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    margin: 0;
    padding: 0.65rem 0;
    background: transparent;
    color: var(--color-primary, #345a65);
    font-family: var(--font-Signika, inherit);
    font-size: 1.55rem;
    font-weight: var(--fw-bold);
    line-height: 1.2;
    letter-spacing: -0.005em;
    text-decoration: none;
    transition: color 0.22s ease;
  }

  .submenu li:not(.submenu__head) a::after {
    content: "->";
    margin-left: 0.6rem;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity 0.22s ease, transform 0.22s ease;
    color: var(--color-secondary);
    font-weight: 400;
  }

  .submenu li:not(.submenu__head) a:hover,
  .submenu li:not(.submenu__head) a:focus-visible,
  .submenu li:not(.submenu__head) a:active {
    color: var(--color-secondary, #d98c59);
    background: transparent;
    padding-left: 0;
  }

  .submenu li:not(.submenu__head) a:hover::after,
  .submenu li:not(.submenu__head) a:focus-visible::after,
  .submenu li:not(.submenu__head) a:active::after {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Desktop: hover dropdowns */
@media (min-width: 769px) {
  .menu-item.has-submenu:hover .submenu,
  .menu-item.has-submenu:focus-within .submenu {
    display: block;
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
}'''

# Find start: the comment "/* ════════" introducing MOBILE MENU
start_idx = None
for i, ln in enumerate(lines):
    if ln.startswith("/* ") and "MOBILE MENU" in ln:
        start_idx = i
        break
if start_idx is None:
    raise SystemExit("MOBILE MENU header not found")

# Find end: the closing brace of the @media (min-width: 769px) block with hover rules
end_idx = None
i = start_idx
while i < len(lines):
    if "@media (min-width: 769px)" in lines[i]:
        # check if this is the hover-dropdown block
        for j in range(i, min(i + 14, len(lines))):
            if "has-submenu:hover" in lines[j]:
                # find this block's closing brace
                depth = 0
                for k in range(i, len(lines)):
                    depth += lines[k].count("{")
                    depth -= lines[k].count("}")
                    if depth == 0 and "}" in lines[k]:
                        end_idx = k
                        break
                break
        if end_idx is not None:
            break
    i += 1

if end_idx is None:
    raise SystemExit("Could not find end of hover-dropdown media block")

print(f"Replacing lines {start_idx + 1}..{end_idx + 1}")
new_lines = lines[:start_idx] + new_block.split("\n") + lines[end_idx + 1:]
path.write_text("\n".join(new_lines), encoding="utf-8")
print("OK")
