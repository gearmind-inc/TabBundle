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
  id?: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
  windowId: number;
  index: number;
  pinned: boolean;
  incognito?: boolean;
  active?: boolean;
  discarded?: boolean;
  status?: string;
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
    remove: vi.fn(async (keys: string | string[]) => {
      await yieldTurn();
      const list = Array.isArray(keys) ? keys : [keys];
      data = Object.fromEntries(Object.entries(data).filter(([key]) => !list.includes(key)));
    }),
    /** テスト用: 今入っているキーの一覧 */
    keys: () => Object.keys(data),
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

  const toSubTree = (node: StoredNode): chrome.bookmarks.BookmarkTreeNode => {
    const result = toTreeNode(node);
    if (node.url === undefined) result.children = node.childIds.map((childId) => toSubTree(nodes.get(childId)!));
    return result;
  };

  // getTree は実装で使わない (無いので呼ぶと失敗する)
  const bookmarks = {
    getChildren: vi.fn(async (id: string) => {
      await yieldTurn();
      return requireNode(id).childIds.map((childId) => toTreeNode(nodes.get(childId)!));
    }),
    getSubTree: vi.fn(async (id: string) => {
      await yieldTurn();
      return [toSubTree(requireNode(id))];
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
    removeTree: vi.fn(async (id: string) => {
      await yieldTurn();
      const node = requireNode(id);
      const autoFolder = node.parentId !== undefined ? nodes.get(node.parentId) : undefined;
      const oldFolder = autoFolder?.parentId !== undefined ? nodes.get(autoFolder.parentId) : undefined;
      const bundleFolder = oldFolder?.parentId !== undefined ? nodes.get(oldFolder.parentId) : undefined;
      const otherBookmarks = bundleFolder?.parentId !== undefined ? nodes.get(bundleFolder.parentId) : undefined;
      if (
        node.url !== undefined ||
        autoFolder?.title !== "自動バックアップ" ||
        autoFolder.url !== undefined ||
        oldFolder?.title !== "old" ||
        oldFolder.url !== undefined ||
        bundleFolder?.title !== "TabBundle" ||
        bundleFolder.url !== undefined ||
        otherBookmarks?.title !== "その他のブックマーク" ||
        otherBookmarks.folderType !== "other" ||
        otherBookmarks.url !== undefined
      ) {
        throw new Error("removeTree is only permitted for folders directly under TabBundle/old/自動バックアップ/ in Other bookmarks");
      }

      const removeDescendants = (current: StoredNode): void => {
        for (const childId of [...current.childIds]) {
          const child = requireNode(childId);
          removeDescendants(child);
          nodes.delete(childId);
        }
        current.childIds.length = 0;
      };
      removeDescendants(node);
      if (node.parentId !== undefined) {
        const parent = requireNode(node.parentId);
        const index = parent.childIds.indexOf(id);
        if (index !== -1) parent.childIds.splice(index, 1);
      }
      nodes.delete(id);
    }),
  };

  let tabs: FakeTab[] = [];
  /** 最後にフォーカスしたウィンドウ (テストで決めたときだけ lastFocusedWindow で絞り込む) */
  let lastFocusedWindowId: number | undefined;
  const tabsApi = {
    // active / windowId / lastFocusedWindow だけ絞り込む (それ以外の条件は無視して全部返す)
    query: vi.fn(async (query: chrome.tabs.QueryInfo) => {
      await yieldTurn();
      return clone(
        tabs.filter(
          (tab) =>
            (query.active === undefined || (tab.active ?? false) === query.active) &&
            (query.windowId === undefined || tab.windowId === query.windowId) &&
            (query.lastFocusedWindow !== true ||
              lastFocusedWindowId === undefined ||
              tab.windowId === lastFocusedWindowId),
        ),
      );
    }),
    get: vi.fn(async (tabId: number) => {
      await yieldTurn();
      const found = tabs.find((tab) => tab.id === tabId);
      if (!found) throw new Error(`No tab with id: ${tabId}.`);
      return clone(found);
    }),
    create: vi.fn(async (properties: chrome.tabs.CreateProperties) => {
      await yieldTurn();
      return { id: 9999, windowId: 1, index: 0, pinned: false, url: properties.url };
    }),
  };

  // ---- 本文の保存で使う API ----

  const hostPattern = (url: string | undefined): string | undefined => {
    try {
      const parsed = new URL(url ?? "");
      return `${parsed.protocol}//${parsed.hostname}/*`;
    } catch {
      return undefined;
    }
  };

  const grantedOrigins = new Set<string>();
  let nextPermissionAnswer: boolean | Error = true;
  const permissions = {
    request: vi.fn((details: chrome.permissions.Permissions): Promise<boolean> => {
      const answer = nextPermissionAnswer;
      return (async () => {
        await yieldTurn();
        if (answer instanceof Error) throw answer;
        if (answer) for (const origin of details.origins ?? []) grantedOrigins.add(origin);
        return answer;
      })();
    }),
    remove: vi.fn(async (details: chrome.permissions.Permissions) => {
      await yieldTurn();
      for (const origin of details.origins ?? []) grantedOrigins.delete(origin);
      return true;
    }),
    contains: vi.fn(async (details: chrome.permissions.Permissions) => {
      await yieldTurn();
      return (details.origins ?? []).every((origin) => grantedOrigins.has(origin));
    }),
  };

  /** ページの本文 (url → innerText) と、executeScript を失敗させる url */
  const pageBodies = new Map<string, string>();
  const failingUrls = new Set<string>();
  const scripting = {
    executeScript: vi.fn(
      async (injection: { target: { tabId: number }; func: (...args: never[]) => unknown; args?: unknown[] }) => {
        await yieldTurn();
        const found = tabs.find((tab) => tab.id === injection.target.tabId);
        if (!found?.url) throw new Error(`No tab with id: ${injection.target.tabId}.`);
        if (failingUrls.has(found.url)) throw new Error("Cannot access contents of the page.");
        // 本物と同じく、ホストの権限が無ければ失敗する
        const pattern = hostPattern(found.url);
        if (pattern === undefined || !grantedOrigins.has(pattern)) {
          throw new Error("Cannot access contents of the page. Extension manifest must request permission.");
        }
        const maxChars = typeof injection.args?.[0] === "number" ? injection.args[0] : Infinity;
        return [{ frameId: 0, result: { href: found.url, text: (pageBodies.get(found.url) ?? "").slice(0, maxChars) } }];
      },
    ),
  };

  const badges = new Map<number, string>();
  const action = {
    setBadgeText: vi.fn(async (details: { tabId?: number; text: string }) => {
      await yieldTurn();
      if (details.tabId !== undefined) badges.set(details.tabId, details.text);
    }),
    setBadgeBackgroundColor: vi.fn(async (_details: { tabId?: number; color: string }) => {
      await yieldTurn();
    }),
  };

  const menuItems = new Map<string, Record<string, unknown>>();
  const contextMenus = {
    create: vi.fn((properties: chrome.contextMenus.CreateProperties, callback?: () => void) => {
      // 本物は同じ id を 2 回 create すると lastError になる
      if (properties.id !== undefined && menuItems.has(properties.id)) throw new Error(`Cannot create item with duplicate id ${properties.id}`);
      menuItems.set(String(properties.id), { ...properties });
      callback?.();
      return properties.id ?? "";
    }),
    update: vi.fn(async (id: string | number, properties: Record<string, unknown>) => {
      await yieldTurn();
      const item = menuItems.get(String(id));
      if (!item) throw new Error(`Cannot find menu item with id ${id}`);
      menuItems.set(String(id), { ...item, ...properties });
    }),
    removeAll: vi.fn(async () => {
      await yieldTurn();
      menuItems.clear();
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
    permissions,
    scripting,
    action,
    contextMenus,
    runtime: { lastError: undefined as chrome.runtime.LastError | undefined },
    windows: { WINDOW_ID_NONE: -1 },
  };

  /** テスト用の操作 */
  const helpers = {
    setTabs(next: FakeTab[]) {
      tabs = clone(next);
    },
    setLastFocusedWindow(windowId: number) {
      lastFocusedWindowId = windowId;
    },
    /** 次の permissions.request の答え (true = 許可, false = 拒否, Error = 失敗) */
    answerPermissionRequest(answer: boolean | Error) {
      nextPermissionAnswer = answer;
    },
    grantedOrigins: () => [...grantedOrigins].sort(),
    /** ページの本文 (executeScript で読める innerText) を置く */
    setPageBody(url: string, text: string) {
      pageBodies.set(url, text);
    },
    /** この url のページでは executeScript を失敗させる */
    failScriptOn(url: string) {
      failingUrls.add(url);
    },
    badge: (tabId: number) => badges.get(tabId),
    menuItem: (id: string) => menuItems.get(id),
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
