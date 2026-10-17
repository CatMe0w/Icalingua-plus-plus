/**
 * v-lazy-src：图片进入最近的 .panel 滚动容器（没有则为视口）可见范围附近时才设置 src。
 * 浏览器原生的 loading="lazy" 按视口计算且预加载距离很大，对面板内部滚动的表情网格几乎不起作用，
 * 网页版会因此一次性下载全部表情。
 */
import type { DirectiveOptions } from 'vue'

const observers = new Map<Element | null, IntersectionObserver>()

const getObserver = (root: Element | null) => {
    let observer = observers.get(root)
    if (!observer) {
        observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue
                    const img = entry.target as HTMLImageElement
                    img.src = img.dataset.lazySrc
                    observer.unobserve(img)
                }
            },
            { root, rootMargin: '200px' },
        )
        observers.set(root, observer)
    }
    return observer
}

const lazySrc: DirectiveOptions = {
    inserted(el, binding) {
        el.dataset.lazySrc = binding.value
        getObserver(el.closest('.panel')).observe(el)
    },
    update(el, binding) {
        if (binding.value === binding.oldValue) return
        el.dataset.lazySrc = binding.value
        // 已经加载过的直接换图，未加载的等进入可见范围
        if ((el as HTMLImageElement).src) (el as HTMLImageElement).src = binding.value
    },
    unbind(el) {
        observers.forEach((observer) => observer.unobserve(el))
    },
}

export default lazySrc
