import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGING_ALARM_NAME,
  AGING_ALARM_PERIOD_MINUTES,
  OLD_MOVED_AT_STORAGE_KEY,
  SHADOW_DEBOUNCE_MS,
  SHADOW_MAX_WAIT_MS,
  VERIFY_GRACE_MS,
} from "../src/constants";
import { ensureBookmarkLayout } from "../src/chrome/bookmarkLayout";
import { createBackgroundHandlers, type BackgroundHandlers } from "../src/chrome/handlers";
import type { PendingVerifyEntry, Shadow, ShadowTab } from "../src/core/types";
import { installFakeChrome, type FakeChrome, type FakeTab } from "./fakeChrome";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 25, 10, 30).getTime();
const SID = "session-now";

let fake: FakeChrome;
let handlers: BackgroundHandlers;
let allowAgingRemoveTree = false;

function tab(windowId: number, index: number, url: string, extra: Partial<FakeTab> = {}): FakeTab {
  return { windowId, index, url, title: `title-${windowId}-${index}`, pinned: false, ...extra };
}

function shadowTab(windowId: number, index: number, url: string, extra: Partial<ShadowTab> = {}): ShadowTab {
  return { windowId, index, url, title: `title-${windowId}-${index}`, pinned: false, ...extra };
}

function readShadow(): Shadow {
  return fake.local.peek("shadow") as Shadow;
}

function readPendingVerify(): PendingVerifyEntry[] {
  return (fake.local.peek("pendingVerify") as PendingVerifyEntry[] | undefined) ?? [];
}

function autoFolderId(): string | undefined {
  return fake.helpers.path("TabBundle", "自動バックアップ");
}

function autoChildren() {
  const id = autoFolderId();
  return id ? fake.helpers.children(id) : [];
}

/** debounce を経て控えを作り直す */
async function triggerRebuild(): Promise<void> {
  handlers.onShadowTrigger();
  await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS);
  await handlers.whenIdle();
}

beforeEach(() => {
  allowAgingRemoveTree = false;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
  fake = installFakeChrome();
  handlers = createBackgroundHandlers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(fake.chrome.bookmarks.remove).not.toHaveBeenCalled();
  if (!allowAgingRemoveTree) expect(fake.chrome.bookmarks.removeTree).not.toHaveBeenCalled();
});

describe("windows.onRemoved", () => {
  it("控えのタブを並び順のまま全部 (重複 URL も) 自動バックアップ/ の index 0 に書き、saved を true にする", async () => {
    fake.session.seed({ sessionId: SID });
    fake.helpers.setTabs([
      tab(2, 0, "https://other.example/"),
      tab(1, 2, "https://b.example/", { title: "" }),
      tab(1, 0, "https://a.example/", { title: "A" }),
      tab(1, 1, "https://a.example/", { title: "A again" }),
    ]);
    await triggerRebuild();

    // 先に別のウィンドウを閉じておき、新しい物が上に入ることを見る
    fake.helpers.setTabs([tab(1, 0, "https://a.example/", { title: "A" })]);
    vi.setSystemTime(NOW - 60_000);
    await handlers.onWindowRemoved(2);

    fake.helpers.setTabs([]);
    vi.setSystemTime(NOW);
    await handlers.onWindowRemoved(1);

    const children = autoChildren();
    expect(children.map((c) => c.title)).toEqual([
      "2026-09-25 10:30 ウィンドウ (3 タブ)",
      "2026-09-25 10:29 ウィンドウ (1 タブ)",
    ]);
    expect(fake.helpers.children(children[0]!.id)).toEqual([
      expect.objectContaining({ title: "A", url: "https://a.example/" }),
      expect.objectContaining({ title: "A again", url: "https://a.example/" }),
      expect.objectContaining({ title: "https://b.example/", url: "https://b.example/" }),
    ]);
    expect(readShadow().windows["1"]?.saved).toBe(true);
    expect(readShadow().windows["2"]?.saved).toBe(true);

    // 2 回呼んでも二重に書かない
    await handlers.onWindowRemoved(1);
    expect(autoChildren()).toHaveLength(2);
  });

  it("控えに無いウィンドウは何も書かない", async () => {
    fake.session.seed({ sessionId: SID });
    await handlers.onWindowRemoved(42);
    expect(fake.helpers.path("TabBundle")).toBeUndefined();
  });

  it("書き終えたウィンドウは次の作り直しで控えから落ちる", async () => {
    fake.session.seed({ sessionId: SID });
    fake.helpers.setTabs([tab(1, 0, "https://a.example/"), tab(2, 0, "https://b.example/")]);
    await triggerRebuild();
    fake.helpers.setTabs([tab(2, 0, "https://b.example/")]);
    await handlers.onWindowRemoved(1);
    await triggerRebuild();
    expect(Object.keys(readShadow().windows)).toEqual(["2"]);
  });
});

describe("除外", () => {
  beforeEach(() => {
    fake.session.seed({ sessionId: SID });
  });

  it("pinned / chrome-extension:// / chrome://newtab / 空 URL は入らない (控えには全部入る)", async () => {
    fake.helpers.setTabs([
      tab(1, 0, "https://pinned.example/", { pinned: true }),
      tab(1, 1, "chrome-extension://abcdef/page.html"),
      tab(1, 2, "chrome://newtab/"),
      tab(1, 3, ""),
      tab(1, 4, "https://keep.example/"),
      tab(1, 5, "", { pendingUrl: "https://pending.example/" }),
    ]);
    await triggerRebuild();
    expect(readShadow().windows["1"]?.tabs).toHaveLength(6);

    fake.helpers.setTabs([]);
    await handlers.onWindowRemoved(1);

    const children = autoChildren();
    expect(children.map((c) => c.title)).toEqual(["2026-09-25 10:30 ウィンドウ (2 タブ)"]);
    expect(fake.helpers.children(children[0]!.id).map((c) => ("url" in c ? c.url : ""))).toEqual([
      "https://keep.example/",
      "https://pending.example/",
    ]);
  });

  it("除外後 0 タブならフォルダを作らず、印だけ付ける", async () => {
    fake.helpers.setTabs([tab(1, 0, "chrome://newtab/"), tab(1, 1, "https://p.example/", { pinned: true })]);
    await triggerRebuild();
    fake.helpers.setTabs([]);
    await handlers.onWindowRemoved(1);

    expect(autoChildren()).toEqual([]);
    expect(readShadow().windows["1"]?.saved).toBe(true);
  });
});

describe("回収 (前回の Chrome の控え)", () => {
  const T1 = new Date(2026, 8, 24, 21, 5).getTime();
  const T3 = new Date(2026, 8, 24, 22, 7).getTime();

  beforeEach(() => {
    fake.local.seed({
      shadow: {
        sessionId: "previous-session",
        windows: {
          "1": { tabs: [shadowTab(1, 0, "https://w1.example/"), shadowTab(1, 1, "https://w1b.example/")], updatedAt: T1, saved: false },
          "2": { tabs: [shadowTab(2, 0, "https://w2.example/")], updatedAt: T3, saved: true },
          "3": { tabs: [shadowTab(3, 0, "https://w3.example/")], updatedAt: T3, saved: false },
        },
      } satisfies Shadow,
    });
    fake.helpers.setTabs([tab(1, 0, "https://now.example/")]);
  });

  async function expectRecovered(): Promise<void> {
    expect(autoChildren().map((c) => c.title)).toEqual([
      "2026-09-24 22:07 (再起動前) ウィンドウ (1 タブ)",
      "2026-09-24 21:05 (再起動前) ウィンドウ (2 タブ)",
    ]);
    const sessionId = fake.session.peek("sessionId") as string;
    expect(sessionId).toEqual(expect.any(String));
    expect(sessionId).not.toBe("previous-session");
    const shadow = readShadow();
    expect(shadow.sessionId).toBe(sessionId);
    expect(Object.keys(shadow.windows)).toEqual(["1"]);
    expect(shadow.windows["1"]).toEqual({
      tabs: [expect.objectContaining({ url: "https://now.example/" })],
      updatedAt: Date.now(),
      saved: false,
    });
  }

  it("onStartup: saved=false のウィンドウだけを (再起動前) 付きで書き、控えを今のウィンドウだけに作り直す", async () => {
    await handlers.onStartup();
    await expectRecovered();
    expect(fake.chrome.alarms.create).toHaveBeenCalledWith(AGING_ALARM_NAME, { periodInMinutes: AGING_ALARM_PERIOD_MINUTES });
  });

  it("タブのイベント (debounce) が onStartup より先に来ても同じ結果になる", async () => {
    await triggerRebuild();
    await expectRecovered();
    await handlers.onStartup();
    await expectRecovered();
  });

  it("windows.onRemoved が最初の入口でも回収され、前回の windowId の控えは使われない", async () => {
    // 今のセッションの window 1 はもう閉じていて tabs.query に出てこない
    fake.helpers.setTabs([tab(7, 0, "https://seven.example/")]);
    await handlers.onWindowRemoved(1);
    expect(autoChildren().map((c) => c.title)).toEqual([
      "2026-09-24 22:07 (再起動前) ウィンドウ (1 タブ)",
      "2026-09-24 21:05 (再起動前) ウィンドウ (2 タブ)",
    ]);
    expect(Object.keys(readShadow().windows)).toEqual(["7"]);
  });

  it.each(["update", "install", "chrome_update"])(
    "onInstalled(%s) でも storage.session が空なら新しいセッションとして回収される",
    async (reason) => {
      await handlers.onInstalled({ reason });
      await expectRecovered();
      expect(fake.chrome.alarms.create).toHaveBeenCalledTimes(1);
    },
  );

  it("回収したウィンドウは今のセッションの確かめ待ちに入る (0 タブのウィンドウは入らない)", async () => {
    fake.local.seed({
      shadow: {
        sessionId: "previous-session",
        windows: {
          "1": { tabs: [shadowTab(1, 0, "https://w1.example/", { title: "" })], updatedAt: T1, saved: false },
          "2": { tabs: [shadowTab(2, 0, "chrome://newtab/")], updatedAt: T3, saved: false },
        },
      } satisfies Shadow,
    });
    await handlers.onStartup();

    const sessionId = fake.session.peek("sessionId") as string;
    const [folder] = autoChildren();
    expect(autoChildren()).toHaveLength(1);
    expect(readPendingVerify()).toEqual([
      {
        folderId: folder!.id,
        title: "2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)",
        parentTitle: "自動バックアップ",
        tabs: [{ url: "https://w1.example/", title: "" }],
        sessionId,
        createdAt: NOW,
      },
    ]);
  });
});

describe("aging (7 日で移動し、old で 7 日後に削除)", () => {
  let ids: { manual: string; auto: string; old: string; oldAuto: string };

  beforeEach(() => {
    allowAgingRemoveTree = true;
    fake.session.seed({ sessionId: SID });
    const root = fake.helpers.seedNode("2", "TabBundle");
    const manual = fake.helpers.seedNode(root, "手動保存");
    const auto = fake.helpers.seedNode(root, "自動バックアップ");
    const old = fake.helpers.seedNode(root, "old");
    const oldAuto = fake.helpers.seedNode(old, "自動バックアップ");
    ids = { manual, auto, old, oldAuto };
  });

  function readOldMovedAt(): Record<string, number> {
    return (fake.local.peek(OLD_MOVED_AT_STORAGE_KEY) as Record<string, number> | undefined) ?? {};
  }

  it("alarm: 8 日前の自動バックアップだけ移し、6 日と 7 日ちょうどは残して移動時刻を記録する", async () => {
    const six = fake.helpers.seedNode(ids.auto, "6 日前", { dateAdded: NOW - 6 * DAY });
    const seven = fake.helpers.seedNode(ids.auto, "7 日前", { dateAdded: NOW - 7 * DAY });
    const eight = fake.helpers.seedNode(ids.auto, "8 日前", { dateAdded: NOW - 8 * DAY });
    const bookmark = fake.helpers.seedNode(ids.auto, "直下のブックマーク", {
      url: "https://x.example/",
      dateAdded: NOW - 100 * DAY,
    });
    const manualOld = fake.helpers.seedNode(ids.manual, "手動の古い物", { dateAdded: NOW - 100 * DAY });

    await handlers.onAlarm({ name: AGING_ALARM_NAME });

    expect(fake.helpers.children(ids.oldAuto).map((child) => child.id)).toEqual([eight]);
    expect(fake.helpers.children(ids.auto).map((child) => child.id)).toEqual([six, seven, bookmark]);
    expect(fake.helpers.children(ids.manual).map((child) => child.id)).toEqual([manualOld]);
    expect(readOldMovedAt()).toEqual({ [eight]: NOW });
    expect(fake.chrome.bookmarks.removeTree).not.toHaveBeenCalled();
  });

  it("onStartup: old に 8 日あるフォルダを消し、6 日と 7 日ちょうどは残す", async () => {
    const six = fake.helpers.seedNode(ids.oldAuto, "6 日前に移動", { dateAdded: NOW - 50 * DAY });
    const seven = fake.helpers.seedNode(ids.oldAuto, "7 日前に移動", { dateAdded: NOW - 50 * DAY });
    const eight = fake.helpers.seedNode(ids.oldAuto, "8 日前に移動", { dateAdded: NOW - 50 * DAY });
    const expiredNested = fake.helpers.seedNode(eight, "子フォルダ");
    const expiredTab = fake.helpers.seedNode(expiredNested, "タブ", { url: "https://expired.example/" });
    fake.local.seed({
      [OLD_MOVED_AT_STORAGE_KEY]: {
        [six]: NOW - 6 * DAY,
        [seven]: NOW - 7 * DAY,
        [eight]: NOW - 8 * DAY,
      },
    });

    await handlers.onStartup();

    expect(fake.helpers.children(ids.oldAuto).map((child) => child.id)).toEqual([six, seven]);
    expect(readOldMovedAt()).toEqual({ [six]: NOW - 6 * DAY, [seven]: NOW - 7 * DAY });
    expect(fake.chrome.bookmarks.removeTree.mock.calls.map(([id]) => id)).toEqual([eight]);
    await expect(fake.chrome.bookmarks.get(eight)).rejects.toThrow();
    await expect(fake.chrome.bookmarks.get(expiredNested)).rejects.toThrow();
    await expect(fake.chrome.bookmarks.get(expiredTab)).rejects.toThrow();
  });

  it("記録のない old のフォルダは初回に時刻を付け、7 日 + 1ms 後の実行で消す", async () => {
    const oldFolder = fake.helpers.seedNode(ids.oldAuto, "以前からあるフォルダ", { dateAdded: NOW - 100 * DAY });

    await handlers.onAlarm({ name: AGING_ALARM_NAME });
    expect(fake.helpers.children(ids.oldAuto).map((child) => child.id)).toEqual([oldFolder]);
    expect(readOldMovedAt()).toEqual({ [oldFolder]: NOW });

    vi.setSystemTime(NOW + 7 * DAY + 1);
    await handlers.onAlarm({ name: AGING_ALARM_NAME });

    expect(fake.helpers.children(ids.oldAuto)).toEqual([]);
    expect(readOldMovedAt()).toEqual({});
    expect(fake.chrome.bookmarks.removeTree.mock.calls.map(([id]) => id)).toEqual([oldFolder]);
  });

  it("手動保存、old 直下、old 内の深い階層、url 付き項目は動かさず消さない", async () => {
    const manualFolder = fake.helpers.seedNode(ids.manual, "手動の古いフォルダ", { dateAdded: NOW - 100 * DAY });
    const manualTab = fake.helpers.seedNode(manualFolder, "タブ", { url: "https://manual.example/" });
    const manualSubfolder = fake.helpers.seedNode(ids.manual, "手動のサブフォルダ", { dateAdded: NOW - 100 * DAY });
    const oldDirect = fake.helpers.seedNode(ids.old, "old 直下の利用者フォルダ", { dateAdded: NOW - 100 * DAY });
    const oldDirectChild = fake.helpers.seedNode(oldDirect, "old 直下の子", { url: "https://old.example/" });
    const nestedParent = fake.helpers.seedNode(ids.oldAuto, "old 内の親フォルダ", { dateAdded: NOW - 100 * DAY });
    const deepFolder = fake.helpers.seedNode(nestedParent, "さらに下のフォルダ", { dateAdded: NOW - 100 * DAY });
    const oldBookmark = fake.helpers.seedNode(ids.oldAuto, "old 内のブックマーク", {
      url: "https://bookmark.example/",
      dateAdded: NOW - 100 * DAY,
    });

    await handlers.onAlarm({ name: AGING_ALARM_NAME });

    expect(fake.helpers.children(ids.manual).map((child) => child.id)).toEqual([manualFolder, manualSubfolder]);
    expect(fake.helpers.children(manualFolder).map((child) => child.id)).toEqual([manualTab]);
    expect(fake.helpers.children(ids.old).map((child) => child.id)).toEqual([ids.oldAuto, oldDirect]);
    expect(fake.helpers.children(oldDirect).map((child) => child.id)).toEqual([oldDirectChild]);
    expect(fake.helpers.children(ids.oldAuto).map((child) => child.id)).toEqual([nestedParent, oldBookmark]);
    expect(fake.helpers.children(nestedParent).map((child) => child.id)).toEqual([deepFolder]);
    expect(readOldMovedAt()).toEqual({ [nestedParent]: NOW });
    expect(fake.chrome.bookmarks.removeTree).not.toHaveBeenCalled();
  });

  it("removeTree には old/自動バックアップ/ 直下の期限切れフォルダだけを渡し、old から出た記録を掃除する", async () => {
    const expired = fake.helpers.seedNode(ids.oldAuto, "期限切れ", { dateAdded: NOW - 40 * DAY });
    const movedOut = fake.helpers.seedNode(ids.oldAuto, "old から出た", { dateAdded: NOW - 40 * DAY });
    await fake.chrome.bookmarks.move(movedOut, { parentId: ids.manual });
    fake.local.seed({
      [OLD_MOVED_AT_STORAGE_KEY]: {
        [expired]: NOW - 8 * DAY,
        [movedOut]: NOW - 100 * DAY,
      },
    });

    await handlers.onAlarm({ name: AGING_ALARM_NAME });

    expect(fake.chrome.bookmarks.removeTree.mock.calls.map(([id]) => id)).toEqual([expired]);
    expect(fake.helpers.children(ids.oldAuto)).toEqual([]);
    expect(fake.helpers.children(ids.manual).map((child) => child.id)).toEqual([movedOut]);
    expect(readOldMovedAt()).toEqual({});
    expect(fake.chrome.bookmarks.remove).not.toHaveBeenCalled();
  });

  it("削除直前の get で親が old/自動バックアップ/ ではないと分かったフォルダは消さない", async () => {
    const noLongerInOld = fake.helpers.seedNode(ids.oldAuto, "移動されたフォルダ", { dateAdded: NOW - 40 * DAY });
    fake.local.seed({ [OLD_MOVED_AT_STORAGE_KEY]: { [noLongerInOld]: NOW - 8 * DAY } });
    const originalGet = fake.chrome.bookmarks.get.getMockImplementation()!;
    fake.chrome.bookmarks.get.mockImplementation(async (id) => {
      if (id === noLongerInOld) await fake.chrome.bookmarks.move(id, { parentId: ids.manual });
      return originalGet(id);
    });

    await handlers.onAlarm({ name: AGING_ALARM_NAME });

    expect(fake.chrome.bookmarks.removeTree).not.toHaveBeenCalled();
    expect(fake.helpers.children(ids.manual).map((child) => child.id)).toEqual([noLongerInOld]);
    expect(fake.helpers.children(ids.oldAuto)).toEqual([]);
    expect(readOldMovedAt()).toEqual({});
  });

  it("old/自動バックアップ/ 直下以外のフォルダは removeTree で消せず、中身も残る", async () => {
    const manualFolder = fake.helpers.seedNode(ids.manual, "手動保存のフォルダ");
    const manualChild = fake.helpers.seedNode(manualFolder, "残るブックマーク", { url: "https://manual.example/" });

    await expect(fake.chrome.bookmarks.removeTree(manualFolder)).rejects.toThrow("only permitted");

    expect(fake.helpers.children(ids.manual)).toEqual([{ id: manualFolder, title: "手動保存のフォルダ" }]);
    expect(fake.helpers.children(manualFolder)).toEqual([
      { id: manualChild, title: "残るブックマーク", url: "https://manual.example/" },
    ]);
  });

  it("別名の alarm では何もしない", async () => {
    const agedAuto = fake.helpers.seedNode(ids.auto, "期限を超えた自動バックアップ", { dateAdded: NOW - 8 * DAY });
    const expiredOld = fake.helpers.seedNode(ids.oldAuto, "期限切れ", { dateAdded: NOW - 40 * DAY });
    fake.local.seed({ [OLD_MOVED_AT_STORAGE_KEY]: { [expiredOld]: NOW - 8 * DAY } });
    const before = {
      manual: fake.helpers.children(ids.manual),
      auto: fake.helpers.children(ids.auto),
      old: fake.helpers.children(ids.old),
      oldAuto: fake.helpers.children(ids.oldAuto),
    };

    await handlers.onAlarm({ name: "something-else" });

    expect(fake.helpers.path("TabBundle", "old", "自動バックアップ")).toBe(ids.oldAuto);
    expect(fake.helpers.children(ids.manual)).toEqual(before.manual);
    expect(fake.helpers.children(ids.auto)).toEqual(before.auto);
    expect(fake.helpers.children(ids.old)).toEqual(before.old);
    expect(fake.helpers.children(ids.oldAuto)).toEqual(before.oldAuto);
    expect(fake.helpers.children(ids.auto).map((child) => child.id)).toContain(agedAuto);
    expect(fake.chrome.bookmarks.move).not.toHaveBeenCalled();
    expect(fake.chrome.bookmarks.removeTree).not.toHaveBeenCalled();
    expect(
      fake.chrome.storage.local.set.mock.calls.filter(([items]) => OLD_MOVED_AT_STORAGE_KEY in items),
    ).toEqual([]);
  });
});

describe("ブックマークのレイアウト", () => {
  it("TabBundle 直下を 手動保存 → 自動バックアップ → old の順で作り、old の中に 自動バックアップ を作る", async () => {
    const layout = await ensureBookmarkLayout();
    const root = fake.helpers.path("TabBundle")!;
    expect(layout.rootId).toBe(root);
    expect(fake.helpers.children(root).map((c) => c.title)).toEqual(["手動保存", "自動バックアップ", "old"]);
    expect(fake.helpers.children(layout.oldId).map((c) => c.title)).toEqual(["自動バックアップ"]);
  });

  it("「その他のブックマーク」(folderType other) が無ければ id 2 を使う", async () => {
    const topLevel = await fake.chrome.bookmarks.getChildren("0");
    for (const child of topLevel) delete child.folderType;
    fake.chrome.bookmarks.getChildren.mockResolvedValueOnce(topLevel);
    const layout = await ensureBookmarkLayout();
    expect(fake.helpers.foldersNamed("2", "TabBundle").map((f) => f.id)).toEqual([layout.rootId]);
  });

  describe("「その他のブックマーク」が 2 つある (同期あり / なし)", () => {
    let syncedOther: string;

    beforeEach(() => {
      // id "2" は syncing: false (この端末だけ)。同期ありの物を後ろに足す
      syncedOther = fake.helpers.seedNode("0", "その他のブックマーク", { folderType: "other", syncing: true });
    });

    it("既存の TabBundle がある方を使う (syncing false の方でも)", async () => {
      const existing = fake.helpers.seedNode("2", "TabBundle");
      const layout = await ensureBookmarkLayout();
      expect(layout.rootId).toBe(existing);
      expect(fake.helpers.foldersNamed(syncedOther, "TabBundle")).toEqual([]);
    });

    it("どちらにも TabBundle が無ければ syncing true の方に作る", async () => {
      const layout = await ensureBookmarkLayout();
      expect(fake.helpers.foldersNamed(syncedOther, "TabBundle").map((f) => f.id)).toEqual([layout.rootId]);
      expect(fake.helpers.foldersNamed("2", "TabBundle")).toEqual([]);
    });

    it("両方に TabBundle があれば syncing true の方を使う", async () => {
      fake.helpers.seedNode("2", "TabBundle");
      const synced = fake.helpers.seedNode(syncedOther, "TabBundle");
      const layout = await ensureBookmarkLayout();
      expect(layout.rootId).toBe(synced);
    });
  });

  it("既存フォルダを再利用し、崩れた並びを直し、ユーザーの物は触らない。2 回呼んでも二重にできない", async () => {
    const root = fake.helpers.seedNode("2", "TabBundle");
    const memo = fake.helpers.seedNode(root, "自動バックアップ", { url: "https://memo.example/" });
    const old = fake.helpers.seedNode(root, "old");
    const auto = fake.helpers.seedNode(root, "自動バックアップ");
    const kept = fake.helpers.seedNode(auto, "既存のバックアップ");
    const manual = fake.helpers.seedNode(root, "手動保存");

    const first = await ensureBookmarkLayout();
    const second = await ensureBookmarkLayout();

    expect(second).toEqual(first);
    expect(first).toMatchObject({ rootId: root, manualId: manual, autoId: auto, oldId: old });
    expect(fake.helpers.children(root).map((c) => c.id)).toEqual([manual, auto, old, memo]);
    expect(fake.helpers.children(auto).map((c) => c.id)).toEqual([kept]);
    expect(fake.helpers.foldersNamed("2", "TabBundle")).toHaveLength(1);
    expect(fake.helpers.foldersNamed(old, "自動バックアップ")).toHaveLength(1);
  });

  it("並列に 2 つの保存が走っても TabBundle は 1 つだけ", async () => {
    fake.session.seed({ sessionId: SID });
    fake.helpers.setTabs([tab(1, 0, "https://a.example/"), tab(2, 0, "https://b.example/")]);
    await triggerRebuild();
    fake.helpers.setTabs([]);

    await Promise.all([handlers.onWindowRemoved(1), handlers.onWindowRemoved(2)]);

    expect(fake.helpers.foldersNamed("2", "TabBundle")).toHaveLength(1);
    const root = fake.helpers.path("TabBundle")!;
    expect(fake.helpers.children(root).map((c) => c.title)).toEqual(["手動保存", "自動バックアップ", "old"]);
    expect(autoChildren()).toHaveLength(2);
    expect(readShadow().windows["1"]?.saved).toBe(true);
    expect(readShadow().windows["2"]?.saved).toBe(true);
  });
});

describe("控えの作り直し (debounce)", () => {
  beforeEach(() => {
    fake.session.seed({ sessionId: SID });
    fake.helpers.setTabs([tab(1, 0, "https://a.example/")]);
  });

  it("最後のきっかけから SHADOW_DEBOUNCE_MS 後に 1 回だけ作り直す", async () => {
    handlers.onShadowTrigger();
    await vi.advanceTimersByTimeAsync(400);
    handlers.onTabRemoved(5, { isWindowClosing: false });
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS - 1);
    expect(fake.chrome.tabs.query).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await handlers.whenIdle();
    expect(fake.chrome.tabs.query).toHaveBeenCalledTimes(1);
    expect(fake.chrome.tabs.query).toHaveBeenCalledWith({ windowType: "normal" });
    expect(readShadow().windows["1"]?.updatedAt).toBe(NOW + 400 + SHADOW_DEBOUNCE_MS);
  });

  it("title が 1.5 秒より短い間隔で変わり続けても、最初のきっかけから最大 2 秒で作り直す", async () => {
    // 0, 1000 ミリ秒に title が変わる → 2000 で作り直し。その後 2000, 3000 に変わる → 4000 で作り直し
    handlers.onTabUpdated({ title: "loading 1" });
    await vi.advanceTimersByTimeAsync(1000);
    handlers.onTabUpdated({ title: "loading 2" });
    await vi.advanceTimersByTimeAsync(SHADOW_MAX_WAIT_MS - 1000 - 1);
    expect(fake.chrome.tabs.query).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await handlers.whenIdle();
    expect(fake.chrome.tabs.query).toHaveBeenCalledTimes(1);
    expect(readShadow().windows["1"]?.updatedAt).toBe(NOW + SHADOW_MAX_WAIT_MS);

    // 作り直した後は次のきっかけから数え直す
    handlers.onTabUpdated({ title: "loading 3" });
    await vi.advanceTimersByTimeAsync(1000);
    handlers.onTabUpdated({ title: "loading 4" });
    await vi.advanceTimersByTimeAsync(SHADOW_MAX_WAIT_MS - 1000 - 1);
    expect(fake.chrome.tabs.query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await handlers.whenIdle();
    expect(fake.chrome.tabs.query).toHaveBeenCalledTimes(2);
    expect(readShadow().windows["1"]?.updatedAt).toBe(NOW + 2 * SHADOW_MAX_WAIT_MS);
  });

  it("tabs.onUpdated は url / title / pinned が変わったときだけきっかけにする", async () => {
    handlers.onTabUpdated({ status: "loading" });
    handlers.onTabUpdated({ favIconUrl: "https://a.example/favicon.ico" });
    handlers.onTabUpdated({ audible: true });
    await vi.advanceTimersByTimeAsync(SHADOW_MAX_WAIT_MS * 2);
    await handlers.whenIdle();
    expect(fake.chrome.tabs.query).not.toHaveBeenCalled();

    for (const changeInfo of [{ url: "https://b.example/" }, { title: "B" }, { pinned: true }]) {
      handlers.onTabUpdated({ status: "complete", ...changeInfo });
      await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS);
      await handlers.whenIdle();
    }
    expect(fake.chrome.tabs.query).toHaveBeenCalledTimes(3);
  });

  it("isWindowClosing のタブの削除はきっかけにしない", async () => {
    handlers.onTabRemoved(5, { isWindowClosing: true });
    await vi.advanceTimersByTimeAsync(SHADOW_DEBOUNCE_MS * 2);
    await handlers.whenIdle();
    expect(fake.chrome.tabs.query).not.toHaveBeenCalled();
    expect(fake.local.peek("shadow")).toBeUndefined();
  });

  it("セッション ID が無ければ新しく作って控えに入れる", async () => {
    fake.session.clearAll();
    await triggerRebuild();
    const sessionId = fake.session.peek("sessionId");
    expect(sessionId).toEqual(expect.any(String));
    expect(readShadow().sessionId).toBe(sessionId);
  });
});

describe("確かめ待ち (pendingVerify)", () => {
  it("閉じた時の保存で、書いた中身そのものが今のセッションの項目として入る", async () => {
    fake.session.seed({ sessionId: SID });
    fake.helpers.setTabs([
      tab(1, 0, "https://a.example/", { title: "A" }),
      tab(1, 1, "chrome://newtab/"),
      tab(1, 2, "https://b.example/", { title: "" }),
    ]);
    await triggerRebuild();
    fake.helpers.setTabs([]);
    vi.setSystemTime(NOW);
    await handlers.onWindowRemoved(1);

    const [folder] = autoChildren();
    expect(readPendingVerify()).toEqual([
      {
        folderId: folder!.id,
        title: "2026-09-25 10:30 ウィンドウ (2 タブ)",
        parentTitle: "自動バックアップ",
        tabs: [
          { url: "https://a.example/", title: "A" },
          { url: "https://b.example/", title: "" },
        ],
        sessionId: SID,
        createdAt: NOW,
      },
    ]);
    // 印と確かめ待ちは 1 回の set で書く
    const lastSet = fake.local.set.mock.calls.at(-1)![0];
    expect(Object.keys(lastSet).sort()).toEqual(["pendingVerify", "shadow"]);
    expect(readShadow().windows["1"]?.saved).toBe(true);
  });

  it("除外後 0 タブで作らなかったウィンドウは入らない", async () => {
    fake.session.seed({ sessionId: SID });
    fake.helpers.setTabs([tab(1, 0, "chrome://newtab/")]);
    await triggerRebuild();
    fake.helpers.setTabs([]);
    await handlers.onWindowRemoved(1);
    expect(readPendingVerify()).toEqual([]);
  });

  describe("前のセッションの項目の確かめ (セッションが変わったとき)", () => {
    const T1 = new Date(2026, 8, 24, 21, 5).getTime();
    let autoId: string;
    let existingId: string;

    function entry(folderId: string, title: string, url: string, createdAt = T1 - 1000): PendingVerifyEntry {
      return {
        folderId,
        title,
        parentTitle: "自動バックアップ",
        tabs: [
          { url, title: "T" },
          { url: `${url}2`, title: "" },
        ],
        sessionId: "previous-session",
        createdAt,
      };
    }

    /** 自動バックアップ/ の末尾に title のフォルダを置き、urls のブックマークを並び順で入れる */
    function seedFolder(title: string, urls: string[]): string {
      const id = fake.helpers.seedNode(autoId, title);
      for (const url of urls) fake.helpers.seedNode(id, url, { url });
      return id;
    }

    function childUrls(id: string): (string | undefined)[] {
      return fake.helpers.children(id).map((c) => ("url" in c ? c.url : undefined));
    }

    function expectNoRemoveCalls(): void {
      expect(fake.chrome.bookmarks.remove).not.toHaveBeenCalled();
      expect(fake.chrome.bookmarks.removeTree).not.toHaveBeenCalled();
    }

    beforeEach(() => {
      const root = fake.helpers.seedNode("2", "TabBundle");
      fake.helpers.seedNode(root, "手動保存");
      autoId = fake.helpers.seedNode(root, "自動バックアップ");
      fake.helpers.seedNode(root, "old");
      existingId = seedFolder("2026-09-24 21:00 ウィンドウ (2 タブ)", ["https://kept.example/", "https://kept.example/2"]);
      fake.local.seed({
        shadow: {
          sessionId: "previous-session",
          windows: {
            "1": { tabs: [shadowTab(1, 0, "https://w1.example/")], updatedAt: T1, saved: false },
          },
        } satisfies Shadow,
        pendingVerify: [
          entry(existingId, "2026-09-24 21:00 ウィンドウ (2 タブ)", "https://kept.example/"),
          entry("9999", "2026-09-24 21:04 ウィンドウ (2 タブ)", "https://lost.example/"),
        ],
      });
      fake.helpers.setTabs([tab(1, 0, "https://now.example/")]);
    });

    it("フォルダがあれば項目を消し、消えていれば同じ title と tabs で書き直して今のセッションで入れ直す (回収より前)", async () => {
      await handlers.onStartup();
      const sessionId = fake.session.peek("sessionId") as string;

      const children = autoChildren();
      expect(children.map((c) => c.title)).toEqual([
        "2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)",
        "2026-09-24 21:04 ウィンドウ (2 タブ)",
        "2026-09-24 21:00 ウィンドウ (2 タブ)",
      ]);
      const rewritten = children[1]!;
      expect(fake.helpers.children(rewritten.id)).toEqual([
        expect.objectContaining({ title: "T", url: "https://lost.example/" }),
        expect.objectContaining({ title: "https://lost.example/2", url: "https://lost.example/2" }),
      ]);

      const pending = readPendingVerify();
      expect(pending.map((e) => [e.folderId, e.title, e.sessionId, e.createdAt])).toEqual([
        [rewritten.id, "2026-09-24 21:04 ウィンドウ (2 タブ)", sessionId, NOW],
        [children[0]!.id, "2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)", sessionId, NOW],
      ]);
      expect(pending[0]!.tabs).toEqual([
        { url: "https://lost.example/", title: "T" },
        { url: "https://lost.example/2", title: "" },
      ]);
    });

    it("2 回目の入口では何もしない (二重に書き直さない)", async () => {
      await handlers.onStartup();
      await triggerRebuild();
      expect(autoChildren()).toHaveLength(3);
    });

    it("aging で old/ に移ったフォルダも見つかるので書き直さない", async () => {
      fake.local.seed({
        pendingVerify: [entry(existingId, "2026-09-24 21:00 ウィンドウ (2 タブ)", "https://kept.example/")],
      });
      const oldId = fake.helpers.path("TabBundle", "old")!;
      const oldAuto = fake.helpers.seedNode(oldId, "自動バックアップ");
      await fake.chrome.bookmarks.move(existingId, { parentId: oldAuto, index: 0 });

      await handlers.onStartup();
      expect(autoChildren().map((c) => c.title)).toEqual(["2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)"]);
      expect(readPendingVerify().map((e) => e.title)).toEqual(["2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)"]);
    });

    it("フォルダに 2 タブ中 1 タブしか無ければ、元のフォルダは残したまま全タブで新しいフォルダに書き直す", async () => {
      const title = "2026-09-24 21:02 ウィンドウ (2 タブ)";
      const partialId = seedFolder(title, ["https://partial.example/"]);
      fake.local.seed({ pendingVerify: [entry(partialId, title, "https://partial.example/")] });

      await handlers.onStartup();
      const sessionId = fake.session.peek("sessionId") as string;

      const children = autoChildren();
      expect(children.map((c) => c.id)).toEqual([children[0]!.id, children[1]!.id, existingId, partialId]);
      expect(children.map((c) => c.title)).toEqual([
        "2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)",
        title,
        "2026-09-24 21:00 ウィンドウ (2 タブ)",
        title,
      ]);
      const rewritten = children[1]!;
      expect(childUrls(rewritten.id)).toEqual(["https://partial.example/", "https://partial.example/2"]);
      // 元のフォルダには触らない (消さない・足さない)
      expect(childUrls(partialId)).toEqual(["https://partial.example/"]);
      expect(readPendingVerify().map((e) => [e.folderId, e.title, e.sessionId, e.createdAt])).toEqual([
        [rewritten.id, title, sessionId, NOW],
        [children[0]!.id, "2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)", sessionId, NOW],
      ]);
      expectNoRemoveCalls();
    });

    it("フォルダの子の url の順番が違えば書き直す (元のフォルダは残す)", async () => {
      const title = "2026-09-24 21:03 ウィンドウ (2 タブ)";
      const swappedId = seedFolder(title, ["https://swapped.example/2", "https://swapped.example/"]);
      fake.local.seed({ pendingVerify: [entry(swappedId, title, "https://swapped.example/")] });

      await handlers.onStartup();

      const children = autoChildren();
      expect(children.map((c) => c.title)).toEqual([
        "2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)",
        title,
        "2026-09-24 21:00 ウィンドウ (2 タブ)",
        title,
      ]);
      expect(children[3]!.id).toBe(swappedId);
      expect(childUrls(children[1]!.id)).toEqual(["https://swapped.example/", "https://swapped.example/2"]);
      expect(childUrls(swappedId)).toEqual(["https://swapped.example/2", "https://swapped.example/"]);
      expect(readPendingVerify().map((e) => e.folderId)).toEqual([children[1]!.id, children[0]!.id]);
      expectNoRemoveCalls();
    });

    it("一致して書いてから 60 秒未満なら消さずに今のセッションへ付け替え (createdAt はそのまま)、60 秒経つと刈り取られる", async () => {
      const createdAt = NOW - 30_000;
      fake.local.seed({
        pendingVerify: [entry(existingId, "2026-09-24 21:00 ウィンドウ (2 タブ)", "https://kept.example/", createdAt)],
      });

      await handlers.onStartup();
      const sessionId = fake.session.peek("sessionId") as string;

      // 書き直さない
      expect(autoChildren().map((c) => c.title)).toEqual([
        "2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)",
        "2026-09-24 21:00 ウィンドウ (2 タブ)",
      ]);
      const pending = readPendingVerify();
      expect(pending.map((e) => [e.folderId, e.sessionId, e.createdAt])).toEqual([
        [existingId, sessionId, createdAt],
        [autoChildren()[0]!.id, sessionId, NOW],
      ]);
      expect(pending[0]!.tabs).toEqual(entry(existingId, "", "https://kept.example/").tabs);

      // 60 秒の直前はまだ残る
      vi.setSystemTime(createdAt + VERIFY_GRACE_MS - 1);
      await handlers.onWindowRemoved(42);
      expect(readPendingVerify().map((e) => e.folderId)).toContain(existingId);

      // 60 秒経つと普通の刈り取りで消える
      vi.setSystemTime(createdAt + VERIFY_GRACE_MS);
      await handlers.onWindowRemoved(42);
      expect(readPendingVerify().map((e) => e.folderId)).not.toContain(existingId);
      expectNoRemoveCalls();
    });

    it("一致して書いてから 60 秒以上なら項目を消す", async () => {
      fake.local.seed({
        pendingVerify: [
          entry(existingId, "2026-09-24 21:00 ウィンドウ (2 タブ)", "https://kept.example/", NOW - VERIFY_GRACE_MS),
        ],
      });

      await handlers.onStartup();
      expect(autoChildren()).toHaveLength(2);
      expect(readPendingVerify().map((e) => e.title)).toEqual(["2026-09-24 21:05 (再起動前) ウィンドウ (1 タブ)"]);
    });
  });

  describe("刈り取り", () => {
    function entry(sessionId: string, createdAt: number, folderId: string): PendingVerifyEntry {
      return { folderId, title: folderId, parentTitle: "自動バックアップ", tabs: [], sessionId, createdAt };
    }

    // delayMs = 入口が実際に走るまでの時間 (debounce は SHADOW_DEBOUNCE_MS 待ってから走る)
    it.each([
      ["debounce の作り直し", SHADOW_DEBOUNCE_MS, () => triggerRebuild()],
      ["windows.onRemoved", 0, () => handlers.onWindowRemoved(42)],
      ["alarm", 0, () => handlers.onAlarm({ name: AGING_ALARM_NAME })],
      ["onStartup", 0, () => handlers.onStartup()],
      ["onInstalled", 0, () => handlers.onInstalled({ reason: "update" })],
    ] as const)(
      "%s: 今のセッションで 60 秒経った項目だけ消え、60 秒未満と前のセッションの項目は残る",
      async (_name, delayMs, enter) => {
        const runAt = NOW + delayMs;
        fake.session.seed({ sessionId: SID });
        fake.local.seed({
          shadow: { sessionId: SID, windows: {} } satisfies Shadow,
          pendingVerify: [
            entry(SID, runAt - VERIFY_GRACE_MS, "expired"),
            entry(SID, runAt - VERIFY_GRACE_MS + 1, "young"),
            entry("previous-session", NOW - 10 * DAY, "previous"),
          ],
        });
        await enter();
        expect(readPendingVerify().map((e) => e.folderId)).toEqual(["young", "previous"]);
      },
    );
  });
});

describe("fakeChrome (本物と同じ振る舞い)", () => {
  it("bookmarks.get は無い id で例外を投げる", async () => {
    await expect(fake.chrome.bookmarks.get("no-such-id")).rejects.toThrow();
    await expect(fake.chrome.bookmarks.get("2")).resolves.toEqual([expect.objectContaining({ id: "2" })]);
  });

  it('getChildren("0") で root の子を返す', async () => {
    const children = await fake.chrome.bookmarks.getChildren("0");
    expect(children.map((c) => [c.id, c.folderType])).toEqual([
      ["1", "bookmarks-bar"],
      ["2", "other"],
    ]);
  });
});
