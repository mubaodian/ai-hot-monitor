"""
JSON-based data store for AI Hot Monitor Skills
Provides persistent storage for watchers, findings, and sources
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid


def create_id(prefix: str) -> str:
    """Generate unique ID with prefix"""
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def now_iso() -> str:
    """Get current time in ISO format"""
    return datetime.utcnow().isoformat() + 'Z'


class Store:
    """JSON-based persistent store"""

    def __init__(self, store_path: Optional[str] = None):
        if store_path is None:
            # Default to data/store.json relative to project root
            store_path = os.path.join(
                os.path.dirname(__file__),
                '../../data/store.json'
            )

        self.store_path = Path(store_path)
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        self.state = self._load_or_create()

    def _load_or_create(self) -> Dict[str, Any]:
        """Load store from file or create default"""
        if self.store_path.exists():
            try:
                with open(self.store_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                pass

        return self._create_default_state()

    def _create_default_state(self) -> Dict[str, Any]:
        """Create default store state"""
        return {
            'settings': {
                'openRouterApiKey': '',
                'openRouterModel': 'openai/gpt-4.1-mini',
                'smtpHost': '',
                'smtpPort': 587,
                'smtpSecure': False,
                'smtpUser': '',
                'smtpPass': '',
                'emailFrom': '',
                'emailTo': '',
                'twitterApiKey': '',
                'pollIntervalMs': 60000,
                'browserNotificationsEnabled': True
            },
            'watchers': [],
            'sources': self._create_default_sources(),
            'findings': [],
            'notifications': [],
            'activity': [
                {
                    'id': create_id('activity'),
                    'level': 'info',
                    'type': 'boot',
                    'message': 'Store initialized',
                    'createdAt': now_iso()
                }
            ]
        }

    def _create_default_sources(self) -> List[Dict[str, Any]]:
        """Create default information sources"""
        now = now_iso()
        return [
            {
                'id': 'src_rss_hn_ai',
                'name': 'HN RSS: AI',
                'type': 'rss',
                'enabled': True,
                'config': {
                    'feedUrl': 'https://hnrss.org/newest?q=AI',
                    'limit': 12
                },
                'createdAt': now,
                'updatedAt': now
            },
            {
                'id': 'src_bing_web',
                'name': 'Bing Web Search',
                'type': 'bing_web',
                'enabled': True,
                'config': {
                    'queryTemplate': '{query}',
                    'limit': 8
                },
                'createdAt': now,
                'updatedAt': now
            },
            {
                'id': 'src_baidu_web',
                'name': 'Baidu Search',
                'type': 'baidu_web',
                'enabled': True,
                'config': {
                    'queryTemplate': '{query}',
                    'limit': 8
                },
                'createdAt': now,
                'updatedAt': now
            },
            {
                'id': 'src_weibo_hot',
                'name': 'Weibo Hot',
                'type': 'weibo_hot',
                'enabled': True,
                'config': {
                    'limit': 15
                },
                'createdAt': now,
                'updatedAt': now
            }
        ]

    def save(self) -> None:
        """Save state to file"""
        with open(self.store_path, 'w', encoding='utf-8') as f:
            json.dump(self.state, f, indent=2, ensure_ascii=False)

    def get_state(self) -> Dict[str, Any]:
        """Get current state"""
        return self.state

    def create_watcher(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new watcher"""
        watcher = {
            'id': create_id('watch'),
            'name': params.get('name', params.get('query')),
            'query': params['query'],
            'scope': params.get('scope', ''),
            'enabled': params.get('enabled', True),
            'intervalMinutes': params.get('intervalMinutes', 15),
            'notificationChannels': params.get('notificationChannels', []),
            'sourceIds': params.get('sourceIds', []),
            'createdAt': now_iso(),
            'updatedAt': now_iso(),
            'lastRunAt': None
        }

        self.state['watchers'].append(watcher)
        self.save()
        return watcher

    def update_source(self, source_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update a source configuration"""
        for source in self.state['sources']:
            if source['id'] == source_id:
                if 'enabled' in updates:
                    source['enabled'] = updates['enabled']
                if 'config' in updates:
                    source['config'].update(updates['config'])
                source['updatedAt'] = now_iso()
                self.save()
                return source

        raise ValueError(f"Source not found: {source_id}")

    def add_finding(self, finding: Dict[str, Any]) -> Dict[str, Any]:
        """Add a new finding"""
        finding_obj = {
            'id': create_id('finding'),
            'detectedAt': now_iso(),
            **finding
        }

        self.state['findings'].append(finding_obj)
        self.save()
        return finding_obj

    def get_finding(self, finding_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific finding"""
        for finding in self.state['findings']:
            if finding['id'] == finding_id:
                return finding
        return None
