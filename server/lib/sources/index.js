import { fetchRssItems } from './rss.js';
import { fetchSearchItems } from './search-web.js';
import { fetchWeiboHotItems } from './weibo.js';
import { fetchWebpageItems } from './webpage.js';
import { fetchTwitterItems } from './twitterapi.js';

export async function fetchSourceItems({ source, watcher, settings }) {
  switch (source.type) {
    case 'rss':
      return fetchRssItems({ source, watcher, settings });
    case 'bing_web':
    case 'baidu_web':
      return fetchSearchItems({ source, watcher, settings });
    case 'weibo_hot':
      return fetchWeiboHotItems({ source, watcher, settings });
    case 'webpage':
      return fetchWebpageItems({ source, watcher, settings });
    case 'twitterapi_io':
      return fetchTwitterItems({ source, watcher, settings });
    default:
      throw new Error(`Unsupported source type: ${source.type}`);
  }
}

