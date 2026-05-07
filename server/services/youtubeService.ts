import { searchYouTubeVideos, YouTubeVideo } from "../../lib/youtube";

export async function getEquipmentVideos(searchQuery: string): Promise<YouTubeVideo[]> {
  return searchYouTubeVideos(searchQuery, 3);
}
