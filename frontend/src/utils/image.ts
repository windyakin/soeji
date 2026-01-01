/**
 * サムネイル用のURLを生成する
 * converterを経由してリサイズ・WebP変換を行う
 */
export function getThumbnailUrl(
  s3Url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    fit?: 'cover' | 'contain' | 'fill';
  } = {}
): string {
  const params = new URLSearchParams();

  if (options.width) {
    params.set('w', options.width.toString());
  }
  if (options.height) {
    params.set('h', options.height.toString());
  }
  if (options.quality) {
    params.set('q', options.quality.toString());
  }
  if (options.fit) {
    params.set('fit', options.fit);
  }

  const queryString = params.toString();
  if (queryString) {
    return `${s3Url}?${queryString}`;
  }
  return s3Url;
}

/**
 * オリジナル画像をダウンロードするためのURLを生成する
 * converterを経由して非劣化のデータをそのまま返す
 */
export function getDownloadUrl(s3Url: string): string {
  return `${s3Url}?download=1`;
}
