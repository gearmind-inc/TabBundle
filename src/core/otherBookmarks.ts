import { FALLBACK_OTHER_BOOKMARKS_ID } from "../constants";

/** 同じ親の直下で title が一致し url を持たない最初のフォルダ */
export function findFolderByTitle<T extends { title: string; url?: string }>(children: readonly T[], title: string): T | undefined {
  return children.find((node) => node.title === title && node.url === undefined);
}

/** 「その他のブックマーク」の候補 (bookmarks.getChildren("0") のうち folderType === "other" のもの) */
export interface OtherBookmarksCandidate {
  id: string;
  syncing?: boolean;
  /** 直下に TabBundle フォルダを持つか */
  hasRootFolder: boolean;
}

/** syncing === true を優先し、無ければ並び順が先の物 */
function pickPreferred(candidates: readonly OtherBookmarksCandidate[]): OtherBookmarksCandidate | undefined {
  return candidates.find((candidate) => candidate.syncing === true) ?? candidates[0];
}

/**
 * TabBundle を置く「その他のブックマーク」の id を選ぶ。
 * 1. 既に TabBundle を持つ候補 (複数あれば syncing === true、次に並び順が先の物)
 * 2. 無ければ syncing === true の候補、無ければ最初の候補
 * 3. 候補が無ければ id "2"
 */
export function chooseOtherBookmarksId(candidates: readonly OtherBookmarksCandidate[]): string {
  const withRoot = candidates.filter((candidate) => candidate.hasRootFolder);
  return (pickPreferred(withRoot) ?? pickPreferred(candidates))?.id ?? FALLBACK_OTHER_BOOKMARKS_ID;
}
