import { describe, expect, it } from "vitest";
import { AGING_DAYS } from "../src/constants";
import { isAged, selectAgingTargets } from "../src/core/aging";
import { isExcludedTab, selectSavableTabs } from "../src/core/exclude";
import { buildBackupFolderName, formatLocalDateTime } from "../src/core/folderName";
import { chooseOtherBookmarksId, findFolderByTitle } from "../src/core/otherBookmarks";
import {
  carryOverVerifiedEntry,
  folderContentMatches,
  isPendingVerifyExpired,
  partitionPendingVerify,
  prunePendingVerify,
  toPendingVerifyEntry,
} from "../src/core/pendingVerify";
import { mergeShadow, toShadowTab } from "../src/core/shadow";
import { computeDebounceDelay, isShadowTriggerUpdate } from "../src/core/shadowTrigger";
import type { PendingVerifyEntry, Shadow, ShadowTab, TabLike } from "../src/core/types";

const DAY = 24 * 60 * 60 * 1000;

function tab(windowId: number, index: number, url: string, extra: Partial<TabLike> = {}): TabLike {
  return { windowId, index, url, title: `t${index}`, pinned: false, ...extra };
}

function shadowTab(windowId: number, index: number, url: string, extra: Partial<ShadowTab> = {}): ShadowTab {
  return { windowId, index, url, title: `t${index}`, pinned: false, ...extra };
}

describe("buildBackupFolderName", () => {
  it("ローカル時刻をゼロ埋めした名前を作る", () => {
    const time = new Date(2026, 0, 5, 7, 3).getTime();
    expect(formatLocalDateTime(time)).toBe("2026-01-05 07:03");
    expect(buildBackupFolderName(time, 3, false)).toBe("2026-01-05 07:03 ウィンドウ (3 タブ)");
  });

  it("再起動前の回収分には (再起動前) が付く", () => {
    const time = new Date(2026, 11, 31, 23, 59).getTime();
    expect(buildBackupFolderName(time, 12, true)).toBe("2026-12-31 23:59 (再起動前) ウィンドウ (12 タブ)");
  });
});

describe("isExcludedTab / selectSavableTabs", () => {
  it("pinned / chrome-extension:// / chrome://newtab / 空 URL を除外する", () => {
    expect(isExcludedTab(shadowTab(1, 0, "https://a.example/", { pinned: true }))).toBe(true);
    expect(isExcludedTab(shadowTab(1, 0, "chrome-extension://abc/page.html"))).toBe(true);
    expect(isExcludedTab(shadowTab(1, 0, "chrome://newtab/"))).toBe(true);
    expect(isExcludedTab(shadowTab(1, 0, ""))).toBe(true);
    expect(isExcludedTab(shadowTab(1, 0, "chrome://settings/"))).toBe(false);
    expect(isExcludedTab(shadowTab(1, 0, "https://a.example/"))).toBe(false);
  });

  it("除外後のタブを index 順に並べ、重複 URL は残す", () => {
    const tabs = [
      shadowTab(1, 2, "https://b.example/"),
      shadowTab(1, 0, "https://a.example/"),
      shadowTab(1, 1, "https://a.example/"),
      shadowTab(1, 3, "chrome://newtab/"),
    ];
    expect(selectSavableTabs(tabs).map((t) => [t.index, t.url])).toEqual([
      [0, "https://a.example/"],
      [1, "https://a.example/"],
      [2, "https://b.example/"],
    ]);
  });
});

describe("toShadowTab", () => {
  it("url が空なら pendingUrl を使う", () => {
    expect(toShadowTab({ ...tab(1, 0, ""), pendingUrl: "https://p.example/" }).url).toBe("https://p.example/");
    expect(toShadowTab({ windowId: 1, index: 0, pinned: false }).url).toBe("");
  });
});

describe("isAged / selectAgingTargets", () => {
  const now = new Date(2026, 8, 25, 12, 0).getTime();

  it("30 日ちょうどは移さず、それを超えたら移す", () => {
    expect(isAged(now - AGING_DAYS * DAY, now)).toBe(false);
    expect(isAged(now - AGING_DAYS * DAY - 1, now)).toBe(true);
  });

  it("古いフォルダだけを dateAdded の古い順に返す (ブックマークは対象外)", () => {
    const children = [
      { id: "new", dateAdded: now - DAY },
      { id: "old2", dateAdded: now - 40 * DAY },
      { id: "bm", url: "https://x.example/", dateAdded: now - 90 * DAY },
      { id: "old1", dateAdded: now - 60 * DAY },
      { id: "nodate" },
    ];
    expect(selectAgingTargets(children, now).map((c) => c.id)).toEqual(["old1", "old2"]);
  });
});

describe("mergeShadow", () => {
  const now = 1_000_000;

  it("今あるウィンドウは今のタブで作り直し、saved は前の値を引き継ぐ", () => {
    const prev: Shadow = {
      sessionId: "s1",
      windows: { "1": { tabs: [shadowTab(1, 0, "https://old.example/")], updatedAt: 1, saved: true } },
    };
    const next = mergeShadow(prev, [tab(1, 1, "https://b.example/"), tab(1, 0, "https://a.example/"), tab(2, 0, "https://c.example/")], now, "s1");
    expect(next.sessionId).toBe("s1");
    expect(next.windows["1"]).toEqual({
      tabs: [shadowTab(1, 0, "https://a.example/"), shadowTab(1, 1, "https://b.example/")],
      updatedAt: now,
      saved: true,
    });
    expect(next.windows["2"]?.saved).toBe(false);
    expect(next.windows["2"]?.updatedAt).toBe(now);
  });

  it("今無いウィンドウは saved=false なら残り、saved=true なら落ちる", () => {
    const unsaved = { tabs: [shadowTab(5, 0, "https://u.example/")], updatedAt: 10, saved: false };
    const prev: Shadow = {
      sessionId: "s1",
      windows: { "5": unsaved, "6": { tabs: [shadowTab(6, 0, "https://s.example/")], updatedAt: 10, saved: true } },
    };
    const next = mergeShadow(prev, [tab(1, 0, "https://a.example/")], now, "s1");
    expect(next.windows["5"]).toEqual(unsaved);
    expect(next.windows["6"]).toBeUndefined();
    expect(Object.keys(next.windows).sort()).toEqual(["1", "5"]);
  });

  it("前の控えの sessionId が違えば前のウィンドウは混ぜない", () => {
    const prev: Shadow = {
      sessionId: "old",
      windows: { "1": { tabs: [], updatedAt: 1, saved: true }, "9": { tabs: [], updatedAt: 1, saved: false } },
    };
    const next = mergeShadow(prev, [tab(1, 0, "https://a.example/")], now, "new");
    expect(next.windows["1"]?.saved).toBe(false);
    expect(next.windows["9"]).toBeUndefined();
  });

  it("シークレットのタブは控えに入れない", () => {
    const next = mergeShadow(undefined, [tab(3, 0, "https://secret.example/", { incognito: true })], now, "s1");
    expect(next.windows).toEqual({});
  });
});

describe("isShadowTriggerUpdate", () => {
  it("url / title / pinned のどれかがあればきっかけにする", () => {
    expect(isShadowTriggerUpdate({ url: "https://a.example/" })).toBe(true);
    expect(isShadowTriggerUpdate({ title: "" })).toBe(true);
    expect(isShadowTriggerUpdate({ pinned: false })).toBe(true);
    expect(isShadowTriggerUpdate({ status: "complete", title: "A" })).toBe(true);
  });

  it("status / favIconUrl / audible だけの変化はきっかけにしない", () => {
    expect(isShadowTriggerUpdate({ status: "loading" })).toBe(false);
    expect(isShadowTriggerUpdate({ favIconUrl: "https://a.example/favicon.ico" })).toBe(false);
    expect(isShadowTriggerUpdate({ audible: true })).toBe(false);
    expect(isShadowTriggerUpdate({})).toBe(false);
  });
});

describe("computeDebounceDelay", () => {
  const base = { waitMs: 1500, maxWaitMs: 2000, firstTriggerAt: 10_000 };

  it("最初のきっかけでは waitMs 待つ", () => {
    expect(computeDebounceDelay({ ...base, now: 10_000 })).toBe(1500);
  });

  it("最後のきっかけから waitMs と、最初のきっかけから maxWaitMs の早い方", () => {
    expect(computeDebounceDelay({ ...base, now: 10_400 })).toBe(1500);
    expect(computeDebounceDelay({ ...base, now: 10_500 })).toBe(1500);
    expect(computeDebounceDelay({ ...base, now: 11_000 })).toBe(1000);
    expect(computeDebounceDelay({ ...base, now: 11_999 })).toBe(1);
  });

  it("上限を過ぎていたら 0 (すぐ)", () => {
    expect(computeDebounceDelay({ ...base, now: 12_000 })).toBe(0);
    expect(computeDebounceDelay({ ...base, now: 13_000 })).toBe(0);
  });
});

describe("chooseOtherBookmarksId / findFolderByTitle", () => {
  it("既に TabBundle を持つ候補を使う (syncing false でも)", () => {
    expect(
      chooseOtherBookmarksId([
        { id: "a", syncing: true, hasRootFolder: false },
        { id: "b", syncing: false, hasRootFolder: true },
      ]),
    ).toBe("b");
  });

  it("TabBundle を持つ候補が複数なら syncing true、次に並び順が先の物", () => {
    expect(
      chooseOtherBookmarksId([
        { id: "a", syncing: false, hasRootFolder: true },
        { id: "b", syncing: true, hasRootFolder: true },
      ]),
    ).toBe("b");
    expect(
      chooseOtherBookmarksId([
        { id: "a", syncing: false, hasRootFolder: true },
        { id: "b", syncing: false, hasRootFolder: true },
      ]),
    ).toBe("a");
  });

  it("TabBundle が無ければ syncing true、無ければ最初、候補が無ければ id 2", () => {
    expect(
      chooseOtherBookmarksId([
        { id: "a", syncing: false, hasRootFolder: false },
        { id: "b", syncing: true, hasRootFolder: false },
      ]),
    ).toBe("b");
    expect(
      chooseOtherBookmarksId([
        { id: "a", hasRootFolder: false },
        { id: "b", hasRootFolder: false },
      ]),
    ).toBe("a");
    expect(chooseOtherBookmarksId([])).toBe("2");
  });

  it("title が一致し url を持たない最初のフォルダを返す", () => {
    const children = [
      { id: "1", title: "TabBundle", url: "https://x.example/" },
      { id: "2", title: "tabbundle" },
      { id: "3", title: "TabBundle" },
      { id: "4", title: "TabBundle" },
    ];
    expect(findFolderByTitle(children, "TabBundle")?.id).toBe("3");
    expect(findFolderByTitle(children, "none")).toBeUndefined();
  });
});

describe("pendingVerify", () => {
  const graceMs = 60_000;
  const now = 1_000_000;

  function entry(sessionId: string, createdAt: number, folderId: string): PendingVerifyEntry {
    return { folderId, title: "t", parentTitle: "自動バックアップ", tabs: [], sessionId, createdAt };
  }

  it("書いたフォルダから項目を作る", () => {
    const folder = { folderId: "10", title: "name", tabs: [{ url: "https://a.example/", title: "A" }] };
    expect(toPendingVerifyEntry(folder, "s1", 5)).toEqual({
      folderId: "10",
      title: "name",
      parentTitle: "自動バックアップ",
      tabs: [{ url: "https://a.example/", title: "A" }],
      sessionId: "s1",
      createdAt: 5,
    });
  });

  it("今のセッションで graceMs 以上経った項目だけを刈り取る (前のセッションの項目は刈り取らない)", () => {
    expect(isPendingVerifyExpired(entry("s1", now - graceMs, "x"), "s1", now, graceMs)).toBe(true);
    expect(isPendingVerifyExpired(entry("s1", now - graceMs + 1, "x"), "s1", now, graceMs)).toBe(false);
    expect(isPendingVerifyExpired(entry("s0", now - 100 * graceMs, "x"), "s1", now, graceMs)).toBe(false);

    const entries = [entry("s1", now - graceMs, "expired"), entry("s0", 0, "previous"), entry("s1", now - 1, "young")];
    expect(prunePendingVerify(entries, "s1", now, graceMs).map((e) => e.folderId)).toEqual(["previous", "young"]);
  });

  it("今のセッションと前のセッションに分ける (並び順は保つ)", () => {
    const entries = [entry("s0", 1, "p1"), entry("s1", 2, "c1"), entry("old", 3, "p2")];
    const { current, previous } = partitionPendingVerify(entries, "s1");
    expect(current.map((e) => e.folderId)).toEqual(["c1"]);
    expect(previous.map((e) => e.folderId)).toEqual(["p1", "p2"]);
  });

  it("フォルダの中身は、子の数と各子の url が順番どおり一致したときだけ一致とみなす", () => {
    const tabs = [
      { url: "https://a.example/", title: "A" },
      { url: "https://b.example/", title: "" },
    ];
    expect(folderContentMatches(["https://a.example/", "https://b.example/"], tabs)).toBe(true);
    expect(folderContentMatches(["https://a.example/"], tabs)).toBe(false);
    expect(folderContentMatches(["https://b.example/", "https://a.example/"], tabs)).toBe(false);
    expect(folderContentMatches(["https://a.example/", "https://b.example/", "https://c.example/"], tabs)).toBe(false);
    expect(folderContentMatches(["https://a.example/", undefined], tabs)).toBe(false);
    expect(folderContentMatches([], [])).toBe(true);
  });

  it("一致した前のセッションの項目は、graceMs 未満なら今のセッションへ付け替え、以上なら消す", () => {
    expect(carryOverVerifiedEntry(entry("s0", now - graceMs + 1, "x"), "s1", now, graceMs)).toEqual(
      entry("s1", now - graceMs + 1, "x"),
    );
    expect(carryOverVerifiedEntry(entry("s0", now - graceMs, "x"), "s1", now, graceMs)).toBeUndefined();
  });
});
