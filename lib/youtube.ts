export interface YouTubeVideo {
  youtube_id: string;
  title: string;
  thumbnail_url: string;
  duration: string;
}

export async function searchYouTubeVideos(
  query: string,
  maxResults = 3
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (!searchData.items?.length) return [];

  const videoIds = searchData.items.map((item: any) => item.id.videoId).join(",");
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}&key=${apiKey}`;

  const detailsRes = await fetch(detailsUrl);
  const detailsData = await detailsRes.json();

  return (detailsData.items || []).map((item: any) => ({
    youtube_id: item.id,
    title: item.snippet.title,
    thumbnail_url: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
    duration: formatDuration(item.contentDetails.duration),
  }));
}

function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
