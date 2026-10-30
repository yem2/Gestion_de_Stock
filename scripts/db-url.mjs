/** Neon : la connexion « pooler » ne convient pas aux verrous ; on bascule sur la connexion directe (même base, même identifiants). */
export function directUrl(url) {
  return url.replace(/(@[^./?]+)-pooler(\.)/, "$1$2");
}
