import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGING_ALARM_NAME,
  OLD_MOVED_AT_STORAGE_KEY,
  PAGE_TEXT_GC_DEBOUNCE_MS,
  PAGE_TEXT_HOSTS_STORAGE_KEY,
  PAGE_TEXT_MAX_CHARS,
  PAGE_TEXT_MENU_ID,
} from "../src/constants";
import { createBackgroundHandlers, type BackgroundHandlers } from "../src/chrome/handlers";
import { loadPageTexts } from "../src/chrome/pageTextStore";
import { loadTabBundleBookmarks } from "../src/chrome/tabBundleBookmarks";
import { pageTextKey, type PageTextRecord } from "../src/core/pageText";
import { buildSearchIndex, searchPages } from "../src/core/search";
import type { Shadow } from "../src/core/types";
import { installFakeChrome, type FakeChrome, type FakeTab } from "./fakeChrome";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 25, 10, 30).getTime();
const SID = "session-now";

let fake: FakeChrome;
let handlers: BackgroundHandlers;
let errorSpy: ReturnType<typeof vi.spyOn>;

function tab(id: number, url: string, extra: Partial<FakeTab> = {}): FakeTab {
  return { id, windowId: 1, index: id, url, title: `t${id}`, pinned: false, ...extra };
}

function pageTextKeys(): string[] {
  return fake.local.keys().filter((key) => key.startsWith("pageText:")).sort();
}

function readRecord(url: string): PageTextRecord | undefined {
  return fake.local.peek(pageTextKey(url)) as PageTextRecord | undefined;
}

function onHosts(): string[] {
  return (fake.local.peek(PAGE_TEXT_HOSTS_STORAGE_KEY) as string[] | undefined) ?? [];
}

function record(url: string, host: string, text = "本文"): PageTextRecord {
  return { url, host, text, capturedAt: NOW - DAY };
}

/** 読み込みが終わった (tabs.onUpdated の status complete) */
async function completeLoad(t: FakeTab): Promise<void> {
  await handlers.onPageTabUpdated(t.id!, { status: "complete" }, t);
  await handlers.whenIdle();
}

/** 右クリックのメニューで ON / OFF を押す */
async function clickMenu(t: FakeTab, checked: boolean): Promise<void> {
  await handlers.onMenuClicked({ menuItemId: PAGE_TEXT_MENU_ID, checked, pageUrl: t.url! }, t);
  await handlers.whenIdle();
}

/** TabBundle/ 配下 (+ 外) のブックマークを置く */
function seedTabBundle() {
  const root = fake.helpers.seedNode("2", "TabBundle");
  const manual = fake.helpers.seedNode(root, "手動保存");
  const auto = fake.helpers.seedNode(root, "自動バックアップ");
  const old = fake.helpers.seedNode(root, "old");
  const oldAuto = fake.helpers.seedNode(old, "自動バックアップ");
  return { root, manual, auto, old, oldAuto };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
  fake = installFakeChrome();
  fake.session.seed({ sessionId: SID });
  handlers = createBackgroundHandlers();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  errorSpy.mockRestore();
  expect(fake.chrome.bookmarks.remove).not.toHaveBeenCalled();
});

describe("検索の対象 (TabBundle/ 配下を読むだけ)", () => {
  it("手動保存 / 自動バックアップ / old/自動バックアップ の全部が対象で、TabBundle の外は対象外", async () => {
    const ids = seedTabBundle();
    fake.helpers.seedNode(ids.manual, "手動のページ", { url: "https://manual.example/" });
    const autoFolder = fake.helpers.seedNode(ids.auto, "2026-09-25 10:00 ウィンドウ (1 タブ)");
    fake.helpers.seedNode(autoFolder, "自動のページ", { url: "https://auto.example/" });
    const oldFolder = fake.helpers.seedNode(ids.oldAuto, "2026-09-10 10:00 ウィンドウ (1 タブ)");
    const nested = fake.helpers.seedNode(oldFolder, "入れ子");
    fake.helpers.seedNode(nested, "古いページ", { url: "https://old.example/" });
    fake.helpers.seedNode(ids.root, "直下のページ", { url: "https://root.example/" });
    // TabBundle の外
    fake.helpers.seedNode("1", "バーのページ", { url: "https://bar.example/" });
    fake.helpers.seedNode("2", "その他直下のページ", { url: "https://other.example/" });

    const bookmarks = await loadTabBundleBookmarks();
    const pages = buildSearchIndex(bookmarks!, await loadPageTexts());
    expect(searchPages(pages, "ページ").map((r) => r.url).sort()).toEqual([
      "https://auto.example/",
      "https://manual.example/",
      "https://old.example/",
      "https://root.example/",
    ]);
    expect(searchPages(pages, "bar.example")).toEqual([]);
    expect(fake.chrome.bookmarks.create).not.toHaveBeenCalled();
  });

  it("TabBundle フォルダが無ければ undefined で、フォルダを作らない", async () => {
    await expect(loadTabBundleBookmarks()).resolves.toBeUndefined();
    expect(fake.chrome.bookmarks.create).not.toHaveBeenCalled();
    expect(fake.helpers.path("TabBundle")).toBeUndefined();
  });
});

describe("本文の保存 (ドメイン単位の ON/OFF)", () => {
  const repoA = tab(1, "https://github.com/owner/a", { active: true });
  const repoB = tab(2, "https://github.com/owner/b");
  const gist = tab(3, "https://gist.github.com/x");
  const other = tab(4, "https://example.com/");

  beforeEach(() => {
    fake.helpers.setTabs([repoA, repoB, gist, other]);
    fake.helpers.setPageBody(repoA.url!, "リポジトリ A の説明 Zebra");
    fake.helpers.setPageBody(repoB.url!, "リポジトリ B の説明");
    fake.helpers.setPageBody(gist.url!, "gist の本文");
    fake.helpers.setPageBody(other.url!, "example の本文");
  });

  it("初期状態は全ドメイン OFF: executeScript は呼ばれず、本文は保存されず、バッジは空", async () => {
    await completeLoad(repoA);
    await completeLoad(other);
    expect(fake.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(pageTextKeys()).toEqual([]);
    expect(onHosts()).toEqual([]);
    expect(fake.helpers.badge(1)).toBe("");
    expect(fake.helpers.badge(4)).toBe("");
  });

  it("ON: 権限を求めて一覧に足し、そのホストの別パスのタブにもバッジ、今のタブの本文をすぐ保存、本文で検索に当たる", async () => {
    await clickMenu(repoA, true);

    expect(fake.chrome.permissions.request).toHaveBeenCalledWith({
      origins: ["https://github.com/*", "http://github.com/*"],
    });
    expect(onHosts()).toEqual(["github.com"]);
    expect(fake.helpers.badge(1)).toBe("ON");
    expect(fake.helpers.badge(2)).toBe("ON");
    // ホスト名の完全一致 (gist.github.com は github.com の ON に含まれない)。切り替えでは他のホストのタブに触らない
    expect(fake.helpers.badge(3)).toBeUndefined();
    expect(fake.helpers.badge(4)).toBeUndefined();
    expect(readRecord(repoA.url!)).toEqual({
      url: repoA.url,
      host: "github.com",
      text: "リポジトリ A の説明 Zebra",
      capturedAt: NOW,
    });
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toBeUndefined(); // メニューはまだ作っていない (onInstalled 前)

    // 同じホストの別パスは読み込み完了で保存、gist と example は保存しない
    await completeLoad(repoB);
    await completeLoad(gist);
    await completeLoad(other);
    expect(pageTextKeys()).toEqual([pageTextKey(repoA.url!), pageTextKey(repoB.url!)]);
    expect(fake.helpers.badge(2)).toBe("ON");
    expect(fake.helpers.badge(3)).toBe("");
    expect(fake.helpers.badge(4)).toBe("");
    expect(fake.chrome.scripting.executeScript.mock.calls.map(([injection]) => injection.target.tabId)).toEqual([1, 2]);

    // 本文の文字列で検索に当たる (タイトルと URL には無い語)
    const ids = seedTabBundle();
    fake.helpers.seedNode(ids.manual, "A", { url: repoA.url! });
    fake.helpers.seedNode(ids.manual, "B", { url: repoB.url! });
    const pages = buildSearchIndex((await loadTabBundleBookmarks())!, await loadPageTexts());
    expect(searchPages(pages, "ｚｅｂｒａ").map((r) => r.url)).toEqual([repoA.url]);
  });

  it("permissions.request はリスナーの中で await を挟まず最初に (同期的に) 呼ばれる", async () => {
    const clicked = handlers.onMenuClicked({ menuItemId: PAGE_TEXT_MENU_ID, checked: true }, repoA);
    expect(fake.chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(fake.chrome.storage.local.get).not.toHaveBeenCalled();
    await clicked;
    await handlers.whenIdle();
    expect(onHosts()).toEqual(["github.com"]);
  });

  it.each([
    ["拒否", false],
    ["失敗", new Error("Permissions request failed")],
  ] as const)("permissions.request が%sなら ON にならず、メニューの checked を false に戻す", async (_name, answer) => {
    await handlers.onInstalled({ reason: "install" });
    fake.helpers.answerPermissionRequest(answer);
    await clickMenu(repoA, true);

    expect(onHosts()).toEqual([]);
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({ checked: false, enabled: true });
    await completeLoad(repoA);
    expect(fake.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(pageTextKeys()).toEqual([]);
    expect(fake.helpers.badge(1)).toBe("");
  });

  it("OFF: 一覧から外し、そのホストの本文を全部消し、権限を外す (他のホストの本文は残る)", async () => {
    await clickMenu(repoA, true);
    await clickMenu(other, true);
    await completeLoad(repoB);
    await completeLoad(other);
    expect(pageTextKeys()).toHaveLength(3);

    await clickMenu(repoA, false);

    expect(onHosts()).toEqual(["example.com"]);
    expect(pageTextKeys()).toEqual([pageTextKey(other.url!)]);
    expect(fake.chrome.permissions.remove).toHaveBeenCalledWith({
      origins: ["https://github.com/*", "http://github.com/*"],
    });
    expect(fake.helpers.grantedOrigins()).toEqual(["http://example.com/*", "https://example.com/*"]);
    expect(fake.helpers.badge(1)).toBe("");
    expect(fake.helpers.badge(2)).toBe("");
    expect(fake.helpers.badge(4)).toBe("ON");

    // OFF の後は取らない
    fake.chrome.scripting.executeScript.mockClear();
    await completeLoad(repoA);
    expect(fake.chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("permissions.onRemoved でホスト権限が外されたら、そのホストを OFF にして本文を消す", async () => {
    await clickMenu(repoA, true);
    await completeLoad(repoB);
    expect(pageTextKeys()).toHaveLength(2);

    await handlers.onPermissionsRemoved({ origins: ["https://github.com/*", "http://github.com/*"] });
    await handlers.whenIdle();

    expect(onHosts()).toEqual([]);
    expect(pageTextKeys()).toEqual([]);
    expect(fake.helpers.badge(1)).toBe("");
    expect(fake.chrome.permissions.remove).not.toHaveBeenCalled();
  });

  it("本文は先頭 20,000 文字で切られ、同じ URL は上書きで 1 つ", async () => {
    await clickMenu(repoA, true);
    fake.helpers.setPageBody(repoB.url!, "x".repeat(PAGE_TEXT_MAX_CHARS + 500));
    await completeLoad(repoB);
    expect(readRecord(repoB.url!)?.text).toHaveLength(PAGE_TEXT_MAX_CHARS);

    fake.helpers.setPageBody(repoB.url!, "新しい本文");
    vi.setSystemTime(NOW + 1000);
    await completeLoad(repoB);
    expect(pageTextKeys().filter((key) => key === pageTextKey(repoB.url!))).toHaveLength(1);
    expect(readRecord(repoB.url!)).toMatchObject({ text: "新しい本文", capturedAt: NOW + 1000 });
  });

  it("executeScript が失敗しても例外が外に漏れず、他のタブの保存は続く", async () => {
    await clickMenu(repoA, true);
    fake.helpers.failScriptOn(repoB.url!);

    await expect(completeLoad(repoB)).resolves.toBeUndefined();
    expect(readRecord(repoB.url!)).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    fake.helpers.setPageBody(repoA.url!, "続きの本文");
    await completeLoad(repoA);
    expect(readRecord(repoA.url!)?.text).toBe("続きの本文");
  });

  it("休止中のタブ・シークレットのタブ・chrome:// のページは読まない", async () => {
    await clickMenu(repoA, true);
    fake.chrome.scripting.executeScript.mockClear();

    const discarded = tab(5, "https://github.com/discarded", { discarded: true });
    const incognito = tab(6, "https://github.com/incognito", { incognito: true });
    const settings = tab(7, "chrome://settings/");
    fake.helpers.setTabs([repoA, discarded, incognito, settings]);
    for (const t of [discarded, incognito, settings]) await completeLoad(t);

    expect(fake.chrome.scripting.executeScript).not.toHaveBeenCalled();
    expect(pageTextKeys()).toEqual([pageTextKey(repoA.url!)]);
    expect(fake.helpers.badge(7)).toBe("");
  });

  it("読む間に OFF にされたら、読んだ本文は保存しない", async () => {
    await clickMenu(repoA, true);
    await clickMenu(repoA, false);
    const original = fake.chrome.scripting.executeScript.getMockImplementation()!;
    fake.chrome.scripting.executeScript.mockImplementationOnce(async (injection) => {
      const result = await original(injection);
      // 読んでいる途中で OFF になった
      fake.local.seed({ [PAGE_TEXT_HOSTS_STORAGE_KEY]: [] });
      return result;
    });
    fake.local.seed({ [PAGE_TEXT_HOSTS_STORAGE_KEY]: ["github.com"] });
    await fake.chrome.permissions.request({ origins: ["https://github.com/*"] });

    await completeLoad(repoB);
    expect(pageTextKeys()).toEqual([]);
  });

  it("読む間に同じタブが別のページへ移ったら、またはタブが閉じられたら、古い URL の本文は保存しない", async () => {
    await clickMenu(repoA, true);
    const original = fake.chrome.scripting.executeScript.getMockImplementation()!;

    fake.chrome.scripting.executeScript.mockImplementationOnce(async (injection) => {
      const result = await original(injection);
      // 読み終えた直後に、同じタブが (同じ ON のホストの) 別のページへ移った
      fake.helpers.setTabs([repoA, { ...repoB, url: "https://github.com/owner/elsewhere" }, gist, other]);
      return result;
    });
    await completeLoad(repoB);
    expect(readRecord(repoB.url!)).toBeUndefined();

    fake.helpers.setTabs([repoA, repoB, gist, other]);
    fake.chrome.scripting.executeScript.mockImplementationOnce(async (injection) => {
      const result = await original(injection);
      // 読み終えた直後に、タブが閉じられた
      fake.helpers.setTabs([repoA, gist, other]);
      return result;
    });
    await completeLoad(repoB);
    expect(readRecord(repoB.url!)).toBeUndefined();
    expect(pageTextKeys()).toEqual([pageTextKey(repoA.url!)]);
  });

  it("読んだページの URL とタブの URL は # 以降も含めて完全一致で比べる (#one の本文の所に #two の本文を入れない)", async () => {
    const one = tab(5, "https://github.com/doc#one");
    fake.helpers.setTabs([repoA, one]);
    await clickMenu(repoA, true);

    // 読んでいる間にページ内の #two へ移った
    fake.chrome.scripting.executeScript.mockImplementationOnce(async () => [
      { frameId: 0, result: { href: "https://github.com/doc#two", text: "two の本文" } },
    ]);
    await completeLoad(one);
    expect(readRecord(one.url!)).toBeUndefined();

    // # まで同じなら保存する
    fake.helpers.setPageBody(one.url!, "one の本文");
    await completeLoad(one);
    expect(readRecord(one.url!)?.text).toBe("one の本文");
  });
});

describe("右クリックのメニューとバッジ", () => {
  const github = tab(1, "https://github.com/a", { active: true, windowId: 1 });
  const settings = tab(2, "chrome://settings/", { active: true, windowId: 2 });

  beforeEach(() => {
    fake.helpers.setTabs([github, settings]);
  });

  it("onInstalled / onStartup で removeAll → create し、何回呼んでも同じ id を二重に作らない", async () => {
    await handlers.onInstalled({ reason: "install" });
    await handlers.onStartup();
    await handlers.onInstalled({ reason: "update" });

    expect(fake.chrome.contextMenus.removeAll).toHaveBeenCalledTimes(3);
    expect(fake.chrome.contextMenus.create).toHaveBeenCalledTimes(3);
    expect(fake.chrome.contextMenus.create.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ id: PAGE_TEXT_MENU_ID, type: "checkbox", contexts: ["action", "page"] }),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("タブを切り替えるとメニューの文字にサイト名が入り、http(s) 以外では押せなくなる", async () => {
    await handlers.onInstalled({ reason: "install" });

    fake.helpers.setLastFocusedWindow(1);
    await handlers.onTabActivated({ tabId: 1, windowId: 1 });
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({
      title: "このサイト (github.com) の本文を保存する",
      checked: false,
      enabled: true,
    });

    fake.helpers.setLastFocusedWindow(2);
    await handlers.onTabActivated({ tabId: 2, windowId: 2 });
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({
      title: "このサイトの本文を保存する",
      checked: false,
      enabled: false,
    });

    // ウィンドウのフォーカスが変わったら、そのウィンドウのアクティブなタブに合わせる
    fake.helpers.setLastFocusedWindow(1);
    await handlers.onWindowFocusChanged(1);
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({ title: "このサイト (github.com) の本文を保存する" });
    await handlers.onWindowFocusChanged(-1);
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({ title: "このサイト (github.com) の本文を保存する" });
  });

  it("ON のホストでは checked が付き、ページを移るたびにバッジを ON / 空 に設定し直す", async () => {
    await handlers.onInstalled({ reason: "install" });
    await clickMenu(github, true);
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({ checked: true });
    expect(fake.helpers.badge(1)).toBe("ON");

    // 同じタブで別のサイトへ移る
    const moved = { ...github, url: "https://example.com/" };
    fake.helpers.setTabs([moved, settings]);
    await handlers.onPageTabUpdated(1, { url: moved.url }, moved);
    expect(fake.helpers.badge(1)).toBe("");
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({
      title: "このサイト (example.com) の本文を保存する",
      checked: false,
    });

    // 戻る
    fake.helpers.setTabs([github, settings]);
    await handlers.onPageTabUpdated(1, { url: github.url }, github);
    expect(fake.helpers.badge(1)).toBe("ON");
  });

  it("メニューは最後にフォーカスしたウィンドウのアクティブなタブだけに合わせ、他のウィンドウのタブの変化では変えない (バッジは変える)", async () => {
    const example = tab(3, "https://example.com/", { active: true, windowId: 2 });
    fake.helpers.setTabs([github, example]);
    fake.helpers.setLastFocusedWindow(1);
    await handlers.onInstalled({ reason: "install" });
    fake.local.seed({ [PAGE_TEXT_HOSTS_STORAGE_KEY]: ["example.com"] });
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({ title: "このサイト (github.com) の本文を保存する" });

    // フォーカスしていないウィンドウ 2 のアクティブなタブが変わった → バッジだけ直す
    await handlers.onPageTabUpdated(3, { url: example.url }, example);
    await handlers.onTabActivated({ tabId: 3, windowId: 2 });
    expect(fake.helpers.badge(3)).toBe("ON");
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({
      title: "このサイト (github.com) の本文を保存する",
      checked: false,
    });

    // 最後にフォーカスしたウィンドウのアクティブなタブならメニューも直す
    const moved = { ...github, url: "https://example.com/other" };
    fake.helpers.setTabs([moved, example]);
    await handlers.onPageTabUpdated(1, { url: moved.url }, moved);
    expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({
      title: "このサイト (example.com) の本文を保存する",
      checked: true,
    });
  });

  it.each([
    ["onStartup", () => handlers.onStartup()],
    ["onInstalled", () => handlers.onInstalled({ reason: "update" })],
  ] as const)(
    "%s: 権限の確かめで OFF に戻してから、バッジとメニューを合わせる (OFF に戻したサイトに ON の印が残らない)",
    async (_name, enter) => {
      fake.helpers.setLastFocusedWindow(1);
      fake.local.seed({ [PAGE_TEXT_HOSTS_STORAGE_KEY]: ["github.com"] });
      await fake.chrome.action.setBadgeText({ tabId: 1, text: "ON" });

      await enter();

      expect(onHosts()).toEqual([]);
      expect(fake.helpers.badge(1)).toBe("");
      expect(fake.helpers.menuItem(PAGE_TEXT_MENU_ID)).toMatchObject({
        title: "このサイト (github.com) の本文を保存する",
        checked: false,
      });
      const lastContains = Math.max(...fake.chrome.permissions.contains.mock.invocationCallOrder);
      expect(Math.min(...fake.chrome.contextMenus.removeAll.mock.invocationCallOrder)).toBeGreaterThan(lastContains);
      expect(Math.min(...fake.chrome.action.setBadgeText.mock.invocationCallOrder.slice(1))).toBeGreaterThan(lastContains);
    },
  );

  it("Chrome の起動時、権限が無くなっているホストは OFF にして本文を消す", async () => {
    fake.local.seed({
      [PAGE_TEXT_HOSTS_STORAGE_KEY]: ["github.com"],
      [pageTextKey(github.url!)]: record(github.url!, "github.com"),
    });
    await handlers.onStartup();
    expect(onHosts()).toEqual([]);
    expect(pageTextKeys()).toEqual([]);
  });
});

describe("本文の片付け (GC)", () => {
  let ids: ReturnType<typeof seedTabBundle>;

  beforeEach(async () => {
    ids = seedTabBundle();
    fake.local.seed({ [PAGE_TEXT_HOSTS_STORAGE_KEY]: ["a.example", "b.example"] });
  });

  it("aging で old から削除されたブックマークの本文は消え、開いているタブ・控え・残るブックマークの本文は残る", async () => {
    const expired = fake.helpers.seedNode(ids.oldAuto, "期限切れ", { dateAdded: NOW - 40 * DAY });
    fake.helpers.seedNode(expired, "消えるページ", { url: "https://a.example/expired" });
    fake.helpers.seedNode(expired, "開いているページ", { url: "https://a.example/open" });
    fake.helpers.seedNode(expired, "控えにあるページ", { url: "https://a.example/shadow" });
    fake.helpers.seedNode(ids.manual, "手動", { url: "https://b.example/manual" });
    fake.local.seed({
      [OLD_MOVED_AT_STORAGE_KEY]: { [expired]: NOW - 8 * DAY },
      shadow: {
        sessionId: SID,
        windows: {
          "9": {
            tabs: [{ url: "https://a.example/shadow", title: "s", windowId: 9, index: 0, pinned: false }],
            updatedAt: NOW,
            saved: false,
          },
        },
      } satisfies Shadow,
      [pageTextKey("https://a.example/expired")]: record("https://a.example/expired", "a.example"),
      [pageTextKey("https://a.example/open")]: record("https://a.example/open", "a.example"),
      [pageTextKey("https://a.example/shadow")]: record("https://a.example/shadow", "a.example"),
      [pageTextKey("https://b.example/manual")]: record("https://b.example/manual", "b.example"),
    });
    fake.helpers.setTabs([tab(1, "https://a.example/open")]);

    await handlers.onAlarm({ name: AGING_ALARM_NAME });

    expect(fake.chrome.bookmarks.removeTree.mock.calls.map(([id]) => id)).toEqual([expired]);
    expect(pageTextKeys()).toEqual(
      [
        pageTextKey("https://a.example/open"),
        pageTextKey("https://a.example/shadow"),
        pageTextKey("https://b.example/manual"),
      ].sort(),
    );
  });

  it("onStartup でも aging の後に片付け、ON に無いホストの本文も消す", async () => {
    fake.helpers.seedNode(ids.manual, "手動", { url: "https://a.example/kept" });
    fake.helpers.seedNode(ids.manual, "OFF のホスト", { url: "https://off.example/" });
    fake.local.seed({
      [pageTextKey("https://a.example/kept")]: record("https://a.example/kept", "a.example"),
      [pageTextKey("https://a.example/nowhere")]: record("https://a.example/nowhere", "a.example"),
      [pageTextKey("https://off.example/")]: record("https://off.example/", "off.example"),
    });
    // 起動時の食い違い直しで OFF にされないよう、ON のホストの権限はある
    await fake.chrome.permissions.request({
      origins: ["https://a.example/*", "http://a.example/*", "https://b.example/*", "http://b.example/*"],
    });

    await handlers.onStartup();
    expect(pageTextKeys()).toEqual([pageTextKey("https://a.example/kept")]);
    expect(onHosts()).toEqual(["a.example", "b.example"]);
  });

  it("bookmarks.onRemoved の後、少し待ってから (debounce) 片付ける", async () => {
    fake.local.seed({ [pageTextKey("https://a.example/removed")]: record("https://a.example/removed", "a.example") });

    handlers.onBookmarkRemoved();
    handlers.onBookmarkRemoved();
    await vi.advanceTimersByTimeAsync(PAGE_TEXT_GC_DEBOUNCE_MS - 1);
    await handlers.whenIdle();
    expect(pageTextKeys()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await handlers.whenIdle();
    expect(pageTextKeys()).toEqual([]);
    expect(fake.chrome.bookmarks.getSubTree).toHaveBeenCalledTimes(1);
  });

  it("控えのうち書き終えた (saved: true) ウィンドウのタブにしか無い URL の本文は消え、まだ書いていないウィンドウのタブの本文は残る", async () => {
    const shadowTab = (url: string, windowId: number) => ({ url, title: "s", windowId, index: 0, pinned: false });
    fake.local.seed({
      shadow: {
        sessionId: SID,
        windows: {
          "7": { tabs: [shadowTab("https://a.example/saved-only", 7)], updatedAt: NOW, saved: true },
          "8": { tabs: [shadowTab("https://a.example/unsaved", 8)], updatedAt: NOW, saved: false },
        },
      } satisfies Shadow,
      [pageTextKey("https://a.example/saved-only")]: record("https://a.example/saved-only", "a.example"),
      [pageTextKey("https://a.example/unsaved")]: record("https://a.example/unsaved", "a.example"),
    });

    handlers.onBookmarkRemoved();
    await vi.advanceTimersByTimeAsync(PAGE_TEXT_GC_DEBOUNCE_MS);
    await handlers.whenIdle();
    expect(pageTextKeys()).toEqual([pageTextKey("https://a.example/unsaved")]);
  });

  it("bookmarks.onMoved でも同じく少し待って片付け、TabBundle の外へ移したブックマークの本文は消える", async () => {
    const moved = fake.helpers.seedNode(ids.manual, "移すページ", { url: "https://a.example/moved" });
    fake.helpers.seedNode(ids.manual, "残るページ", { url: "https://a.example/stay" });
    fake.local.seed({
      [pageTextKey("https://a.example/moved")]: record("https://a.example/moved", "a.example"),
      [pageTextKey("https://a.example/stay")]: record("https://a.example/stay", "a.example"),
    });
    await fake.chrome.bookmarks.move(moved, { parentId: "1" });

    handlers.onBookmarkMoved();
    await vi.advanceTimersByTimeAsync(PAGE_TEXT_GC_DEBOUNCE_MS - 1);
    await handlers.whenIdle();
    expect(pageTextKeys()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    await handlers.whenIdle();
    expect(pageTextKeys()).toEqual([pageTextKey("https://a.example/stay")]);
  });

  it("本文以外のキー (控え・確かめ待ち・ON の一覧) には触らない", async () => {
    fake.local.seed({
      shadow: { sessionId: SID, windows: {} } satisfies Shadow,
      pendingVerify: [],
      [pageTextKey("https://a.example/x")]: record("https://a.example/x", "a.example"),
    });
    handlers.onBookmarkRemoved();
    await vi.advanceTimersByTimeAsync(PAGE_TEXT_GC_DEBOUNCE_MS);
    await handlers.whenIdle();
    expect(fake.local.keys().sort()).toEqual([PAGE_TEXT_HOSTS_STORAGE_KEY, "pendingVerify", "shadow"].sort());
  });
});
