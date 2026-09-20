export class ContainerSearcher {
  getDirectDivChildren(parent: Element): HTMLElement[] {
    return Array.from(parent.children).filter(
      (el): el is HTMLElement => el.tagName === 'DIV'
    );
  }

  getNestedDivAtLevel(
    root: Element | null,
    level: number,
    childIndex: number = 1
  ): HTMLElement | null {
    if (!root || level < 1 || childIndex < 1) {
      return null;
    }

    let el: HTMLElement = root as HTMLElement;

    for (let i = 0; i < level; i++) {
      const divs = this.getDirectDivChildren(el);
      if (divs.length < childIndex) {
        return null;
      }
      el = divs[childIndex - 1];
    }

    return el;
  }

  traversePath(
    root: Element | null,
    ...indices: number[]
  ): HTMLElement | null {
    if (!root) {
      return null;
    }

    let current: HTMLElement = root as HTMLElement;

    for (const index of indices) {
      if (index < 1) {
        return null;
      }

      const divs = this.getDirectDivChildren(current);
      if (divs.length < index) {
        return null;
      }

      current = divs[index - 1];
    }

    return current;
  }
}

export const searcher = new ContainerSearcher();
