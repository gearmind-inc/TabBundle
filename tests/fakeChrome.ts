import { vi } from "vitest";

/** 非同期 API らしく、呼び出しの途中で他の処理が割り込めるようにする */
async function yieldTurn(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

interface StoredNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded: number;
  folderType?: string;
  syncing?: boolean;
  childIds: string[];
}

export interface FakeTab {
  url?: string;
  pendingUrl?: string;
  title?: string;
  windowId: number;
  index: number;
  pinned: boolean;
  incognito?: boolean;
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function createFakeStorageArea() {
  let data: Record<string, unknown> = {};
  return {
    get: vi.fn(async (keys?: string | string[] | null) => {
      await yieldTurn();
      if (keys === undefined || keys === null) return clone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, unknown> = {};
      for (const key of list) if (key in data) result[key] = clone(data[key]);
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      await yieldTurn();
      data = { ...data, ...clone(items) };
    }),
    /** テスト用: 中身を直接見る / 入れる / 消す */
    peek: (key: string) => clone(data[key]),
    seed: (items: Record<string, unknown>) => {
      data = { ...data, ...clone(items) };
    },
    clearAll: () => {
      data = {};
    },
  };
}

export function createFakeChrome() {
  const nodes = new Map<string, StoredNode>();
  let nextId = 100;

  const addNode = (node: Omit<StoredNode, "childIds">, index?: number): StoredNode => {
    const stored: StoredNode = { ...node, childIds: [] };
    nodes.set(stored.id, stored);
    if (stored.parentId !== undefined) {
      const parent = nodes.get(stored.parentId)!;
      parent.childIds.splice(index ?? parent.childIds.length, 0, stored.id);
    }
    return stored;
  };
  addNode({ id: "0", title: "", dateAdded: 0 });
  addNode({ id: "1", parentId: "0", title: "ブックマーク バー", dateAdded: 0, folderType: "bookmarks-bar" });
  addNode({ id: "2", parentId: "0", title: "その他のブックマーク", dateAdded: 0, folderType: "other" });

  const toTreeNode = (node: StoredNode): chrome.bookmarks.BookmarkTreeNode => {
    const parent = node.parentId !== undefined ? nodes.get(node.parentId) : undefined;
    const result: chrome.bookmarks.BookmarkTreeNode = {
      id: node.id,
      title: node.title,
      dateAdded: node.dateAdded,
      syncing: node.syncing ?? false,
    };
    if (parent) {
      result.parentId = parent.id;
      result.index = parent.childIds.indexOf(node.id);
    }
    if (node.url !== undefined) result.url = node.url;
    if (node.folderType !== undefined) result.folderType = node.folderType as chrome.bookmarks.BookmarkTreeNode["folderType"];
    return result;
  };

  const requireNode = (id: string): StoredNode => {
    const node = nodes.get(id);
    if (!node) throw new Error(`Can't find bookmark for id. (${id})`);
    return node;
  };

  // getTree は実装で使わない (無いので呼ぶと失敗する)
  const bookmarks = {
    getChildren: vi.fn(async (id: string) => {
      await yieldTurn();
      return requireNode(id).childIds.map((childId) => toTreeNode(nodes.get(childId)!));
    }),
    get: vi.fn(async (id: string) => {
      await yieldTurn();
      return [toTreeNode(requireNode(id))];
    }),
    create: vi.fn(async (details: chrome.bookmarks.CreateDetails) => {
      await yieldTurn();
      const parent = requireNode(details.parentId ?? "2");
      if (details.index !== undefined && details.index > parent.childIds.length) throw new Error("Index out of bounds.");
      const node = addNode(
        {
          id: String(nextId++),
          parentId: parent.id,
          title: details.title ?? "",
          ...(details.url !== undefined ? { url: details.url } : {}),
          dateAdded: Date.now(),
        },
        details.index,
      );
      return toTreeNode(node);
    }),
    move: vi.fn(async (id: string, destination: chrome.bookmarks.MoveDestination) => {
      await yieldTurn();
      const node = requireNode(id);
      const oldParent = requireNode(node.parentId!);
      const newParent = requireNode(destination.parentId ?? oldParent.id);
      const oldIndex = oldParent.childIds.indexOf(id);
      let index = destination.index ?? newParent.childIds.length;
      // Chrome と同じく、同じ親の中で下へ動かすときは取り除いた分だけ index がずれる
      if (oldParent === newParent && index > oldIndex) index -= 1;
      oldParent.childIds.splice(oldIndex, 1);
      newParent.childIds.splice(index, 0, id);
      node.parentId = newParent.id;
      return toTreeNode(node);
    }),
    remove: vi.fn(async () => {
      throw new Error("remove must not be called");
    }),
    removeTree: vi.fn(async () => {
      throw new Error("removeTree must not be called");
    }),
  };

  let tabs: FakeTab[] = [];
  const tabsApi = {
    query: vi.fn(async (_query: chrome.tabs.QueryInfo) => {
      await yieldTurn();
      return clone(tabs);
    }),
  };

  const alarmStore = new Map<string, chrome.alarms.Alarm>();
  const alarms = {
    get: vi.fn(async (name: string) => clone(alarmStore.get(name))),
    create: vi.fn(async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
      alarmStore.set(name, {
        name,
        scheduledTime: Date.now(),
        persistAcrossSessions: true,
        ...(info.periodInMinutes !== undefined ? { periodInMinutes: info.periodInMinutes } : {}),
      });
    }),
  };

  const local = createFakeStorageArea();
  const session = createFakeStorageArea();

  const fake = {
    bookmarks,
    tabs: tabsApi,
    alarms,
    storage: { local, session },
  };

  /** テスト用の操作 */
  const helpers = {
    setTabs(next: FakeTab[]) {
      tabs = clone(next);
    },
    /** 指定した親の直下に、dateAdded などを指定してノードを置く */
    seedNode(
      parentId: string,
      title: string,
      options: { url?: string; dateAdded?: number; index?: number; folderType?: string; syncing?: boolean } = {},
    ) {
      return addNode(
        {
          id: String(nextId++),
          parentId,
          title,
          ...(options.url !== undefined ? { url: options.url } : {}),
          ...(options.folderType !== undefined ? { folderType: options.folderType } : {}),
          ...(options.syncing !== undefined ? { syncing: options.syncing } : {}),
          dateAdded: options.dateAdded ?? Date.now(),
        },
        options.index,
      ).id;
    },
    /** 子の [title, url?] を並び順で返す */
    children(id: string) {
      return requireNode(id).childIds.map((childId) => {
        const child = nodes.get(childId)!;
        return child.url === undefined ? { id: child.id, title: child.title } : { id: child.id, title: child.title, url: child.url };
      });
    },
    /** 親の直下から title のフォルダを全部探す */
    foldersNamed(parentId: string, title: string) {
      return helpers.children(parentId).filter((c) => c.title === title && !("url" in c));
    },
    /** TabBundle のパスをたどって id を返す (無ければ undefined) */
    path(...titles: string[]): string | undefined {
      let current = "2";
      for (const title of titles) {
        const found = helpers.foldersNamed(current, title)[0];
        if (!found) return undefined;
        current = found.id;
      }
      return current;
    },
  };

  return { chrome: fake, local, session, helpers };
}

export type FakeChrome = ReturnType<typeof createFakeChrome>;

/** globalThis.chrome に fake を入れる */
export function installFakeChrome(): FakeChrome {
  const fake = createFakeChrome();
  vi.stubGlobal("chrome", fake.chrome);
  return fake;
}
