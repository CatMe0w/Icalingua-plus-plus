/**
 * Electron Menu / MenuItem 的浏览器实现：把菜单渲染成页面内的右键菜单，
 * 让 main/ipc/menuManager.ts 不改动就能在网页版中使用。
 *
 * 支持 menuManager 用到的子集：label、type（normal/separator/submenu/checkbox/radio）、click、submenu、
 * enabled、visible、checked、role（cut/copy/paste/selectAll 等编辑操作）、id。
 */

type ClickHandler = (menuItem: MenuItem, browserWindow: any, event: MouseEvent) => void

interface MenuItemOptions {
    label?: string
    type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
    click?: ClickHandler
    submenu?: MenuItemOptions[] | Menu
    enabled?: boolean
    visible?: boolean
    checked?: boolean
    role?: string
    id?: string
    sublabel?: string
    accelerator?: string
    [key: string]: any
}

const ROLE_LABELS: Record<string, string> = {
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    delete: '删除',
    undo: '撤销',
    redo: '重做',
}

export class MenuItem {
    label: string
    type: MenuItemOptions['type']
    click: ClickHandler
    submenu: Menu | null
    enabled: boolean
    visible: boolean
    checked: boolean
    role: string
    id: string
    sublabel: string
    menu: Menu | null = null

    constructor(options: MenuItemOptions) {
        this.role = options.role
        this.label = options.label ?? ROLE_LABELS[options.role] ?? options.role ?? ''
        this.click = options.click
        this.submenu = options.submenu
            ? options.submenu instanceof Menu
                ? options.submenu
                : Menu.buildFromTemplate(options.submenu)
            : null
        this.type = options.type ?? (this.submenu ? 'submenu' : 'normal')
        this.enabled = options.enabled ?? true
        this.visible = options.visible ?? true
        this.checked = options.checked ?? false
        this.id = options.id
        this.sublabel = options.sublabel
    }
}

export class Menu {
    items: MenuItem[] = []

    static buildFromTemplate(template: (MenuItemOptions | MenuItem)[]) {
        const menu = new Menu()
        for (const item of template) menu.append(item instanceof MenuItem ? item : new MenuItem(item))
        return menu
    }

    // 网页版没有应用菜单栏
    static setApplicationMenu() {}
    static getApplicationMenu(): Menu | null {
        return null
    }

    append(item: MenuItem) {
        item.menu = this
        this.items.push(item)
    }

    insert(pos: number, item: MenuItem) {
        item.menu = this
        this.items.splice(pos, 0, item)
    }

    getMenuItemById(id: string): MenuItem | null {
        for (const item of this.items) {
            if (item.id === id) return item
            const found = item.submenu?.getMenuItemById(id)
            if (found) return found
        }
        return null
    }

    /** x、y 为相对页面可视区域的坐标；省略时使用最近一次鼠标位置 */
    popup(options: { window?: any; x?: number; y?: number; callback?: () => void } = {}) {
        openContextMenu(this, options.x ?? lastPointer.x, options.y ?? lastPointer.y, options.window, options.callback)
    }

    closePopup() {
        closeContextMenu()
    }
}

// region 渲染
const lastPointer = { x: 0, y: 0 }
let current: { root: HTMLElement; callback?: () => void; target: Element | null } | null = null

const STYLE = `
.web-menu {
    position: fixed; z-index: 100000; min-width: 160px; max-width: 320px; padding: 4px 0; margin: 0;
    background: #fff; color: #303133; border: 1px solid #dcdfe6; border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .15); font-size: 13px; user-select: none; overflow-y: auto;
}
.web-menu-item { position: relative; display: flex; align-items: center; gap: 8px; padding: 5px 24px 5px 26px; line-height: 18px;
    white-space: nowrap; cursor: default; }
.web-menu-item:hover:not(.disabled), .web-menu-item.open { background: #ecf5ff; }
.web-menu-item.disabled { color: #c0c4cc; }
.web-menu-item .check { position: absolute; left: 9px; }
.web-menu-item .sublabel { color: #909399; font-size: 12px; }
.web-menu-item .arrow { position: absolute; right: 9px; }
.web-menu-separator { height: 1px; margin: 4px 0; background: #ebeef5; }
@media (prefers-color-scheme: dark) {
    .web-menu { background: #2b2b2b; color: #e5e5e5; border-color: #444; }
    .web-menu-item:hover:not(.disabled), .web-menu-item.open { background: #3a3f4b; }
    .web-menu-item.disabled { color: #777; }
    .web-menu-separator { background: #444; }
}`

const ensureStyle = () => {
    if (document.getElementById('web-menu-style')) return
    const style = document.createElement('style')
    style.id = 'web-menu-style'
    style.textContent = STYLE
    document.head.appendChild(style)
}

/** 把菜单放进可视区域内，放不下时向左/向上翻转 */
const place = (el: HTMLElement, x: number, y: number, flipX?: number) => {
    el.style.left = '0px'
    el.style.top = '0px'
    el.style.maxHeight = window.innerHeight - 8 + 'px'
    const { width, height } = el.getBoundingClientRect()
    if (x + width > window.innerWidth) x = flipX !== undefined ? flipX - width : window.innerWidth - width - 4
    if (y + height > window.innerHeight) y = Math.max(4, window.innerHeight - height - 4)
    el.style.left = Math.max(4, x) + 'px'
    el.style.top = y + 'px'
}

const isEditable = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
    el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement

const runRole = async (role: string, target: Element | null) => {
    if (isEditable(target)) target.focus()
    switch (role) {
        case 'cut':
        case 'copy':
        case 'delete':
        case 'undo':
        case 'redo':
            document.execCommand(role)
            break
        case 'selectAll':
            if (isEditable(target)) target.select()
            else document.execCommand('selectAll')
            break
        case 'paste':
            try {
                const text = await navigator.clipboard.readText()
                if (isEditable(target)) target.focus()
                document.execCommand('insertText', false, text)
            } catch (e) {
                console.warn('[web] 读取剪贴板失败', e)
            }
            break
        default:
            console.warn('[web] 网页版不支持菜单角色', role)
    }
}

const renderMenu = (menu: Menu, win: any): HTMLElement => {
    const el = document.createElement('div')
    el.className = 'web-menu'
    let openSub: { item: HTMLElement; sub: HTMLElement } | null = null
    const closeSub = () => {
        if (!openSub) return
        openSub.item.classList.remove('open')
        openSub.sub.remove()
        openSub = null
    }

    for (const item of menu.items) {
        if (!item.visible) continue
        if (item.type === 'separator') {
            const sep = document.createElement('div')
            sep.className = 'web-menu-separator'
            el.appendChild(sep)
            continue
        }
        const row = document.createElement('div')
        row.className = 'web-menu-item' + (item.enabled ? '' : ' disabled')
        if ((item.type === 'checkbox' || item.type === 'radio') && item.checked) {
            const check = document.createElement('span')
            check.className = 'check'
            check.textContent = item.type === 'radio' ? '●' : '✓'
            row.appendChild(check)
        }
        const label = document.createElement('span')
        label.textContent = item.label.replace(/&(.)/g, '$1')
        row.appendChild(label)
        if (item.sublabel) {
            const sublabel = document.createElement('span')
            sublabel.className = 'sublabel'
            sublabel.textContent = item.sublabel
            row.appendChild(sublabel)
        }
        if (item.submenu) {
            const arrow = document.createElement('span')
            arrow.className = 'arrow'
            arrow.textContent = '›'
            row.appendChild(arrow)
        }

        row.addEventListener('mouseenter', () => {
            if (openSub?.item === row) return
            closeSub()
            if (!item.submenu || !item.enabled) return
            const sub = renderMenu(item.submenu, win)
            document.body.appendChild(sub)
            const rect = row.getBoundingClientRect()
            place(sub, rect.right - 2, rect.top - 5, rect.left + 2)
            row.classList.add('open')
            openSub = { item: row, sub }
        })
        // 阻止 mousedown 的默认行为，避免输入框失去焦点和选区，剪切/复制/粘贴才能作用于原输入框
        row.addEventListener('mousedown', (e) => e.preventDefault())
        row.addEventListener('click', (e) => {
            if (!item.enabled || item.submenu) return
            const target = current?.target ?? null
            closeContextMenu()
            if (item.type === 'checkbox') item.checked = !item.checked
            if (item.type === 'radio') {
                for (const sibling of item.menu?.items ?? []) if (sibling.type === 'radio') sibling.checked = false
                item.checked = true
            }
            if (item.role && !item.click) void runRole(item.role, target)
            else
                try {
                    item.click?.(item, win, e)
                } catch (err) {
                    console.error('[web] 菜单项执行出错', item.label, err)
                }
        })
        el.appendChild(row)
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault())
    return el
}

const openContextMenu = (menu: Menu, x: number, y: number, win: any, callback?: () => void) => {
    closeContextMenu()
    if (!menu.items.some((item) => item.visible)) return
    ensureStyle()
    const root = renderMenu(menu, win)
    document.body.appendChild(root)
    place(root, x, y)
    current = { root, callback, target: document.activeElement }
}

export const closeContextMenu = () => {
    if (!current) return
    const { callback } = current
    current = null
    document.querySelectorAll('.web-menu').forEach((el) => el.remove())
    callback?.()
}

// 记录鼠标位置（供未指定坐标的 popup 使用，也供窗口替身换算屏幕坐标），并处理菜单的关闭
const trackPointer = (e: MouseEvent) => {
    lastPointer.x = e.clientX
    lastPointer.y = e.clientY
    pointerScreenOffset.x = e.screenX - e.clientX
    pointerScreenOffset.y = e.screenY - e.clientY
}
/** 页面可视区域左上角在屏幕上的位置，由最近一次鼠标事件换算得到 */
export const pointerScreenOffset = { x: 0, y: 0 }

window.addEventListener('mousedown', trackPointer, true)
window.addEventListener('contextmenu', trackPointer, true)
window.addEventListener(
    'mousedown',
    (e) => {
        if (current && !(e.target as Element).closest?.('.web-menu')) closeContextMenu()
    },
    true,
)
window.addEventListener('keydown', (e) => e.key === 'Escape' && closeContextMenu(), true)
window.addEventListener('blur', closeContextMenu)
window.addEventListener('resize', closeContextMenu)
// endregion
