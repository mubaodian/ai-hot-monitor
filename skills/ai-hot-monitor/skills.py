#!/usr/bin/env python3
"""
AI Hot Monitor - Agent Skills (Python Implementation)
Fully self-contained, independent skills for Claude Code integration
"""

import json
import sys
import os
from typing import Any, Dict, List, Optional
from pathlib import Path

# Import local store module
sys.path.insert(0, os.path.dirname(__file__))
from store import Store, create_id, now_iso


class HotMonitorSkills:
    """Self-contained skills for AI Hot Monitor"""

    def __init__(self, store_path: Optional[str] = None):
        self.store = Store(store_path)

    def monitor_topic(self, name: str, query: str, scope: str = '',
                     notification_channels: Optional[List[str]] = None,
                     source_ids: Optional[List[str]] = None,
                     interval_minutes: int = 15) -> Dict[str, Any]:
        """
        Create or manage a monitoring task for a specific topic

        Args:
            name: Topic name
            query: Search query
            scope: Topic scope/category
            notification_channels: List of notification channels
            source_ids: List of source IDs to monitor
            interval_minutes: Check interval in minutes

        Returns:
            Created watcher object
        """
        watcher = self.store.create_watcher({
            'name': name,
            'query': query,
            'scope': scope,
            'notificationChannels': notification_channels or [],
            'sourceIds': source_ids or [],
            'intervalMinutes': interval_minutes,
            'enabled': True
        })

        return {
            'id': watcher['id'],
            'name': watcher['name'],
            'query': watcher['query'],
            'scope': watcher['scope'],
            'enabled': watcher['enabled'],
            'intervalMinutes': watcher['intervalMinutes'],
            'notificationChannels': watcher['notificationChannels'],
            'createdAt': watcher['createdAt']
        }

    def search_findings(self, query: str, source_types: Optional[List[str]] = None,
                       limit: int = 20) -> Dict[str, Any]:
        """
        Search for hot topics and findings across multiple sources

        Args:
            query: Search query
            source_types: List of source types to search
            limit: Maximum number of results

        Returns:
            Dictionary with findings list and total count
        """
        state = self.store.get_state()

        # Filter sources
        sources = state['sources']
        if source_types:
            sources = [s for s in sources if s['type'] in source_types and s['enabled']]
        else:
            sources = [s for s in sources if s['enabled']]

        if not sources:
            return {'findings': [], 'total': 0}

        # For now, return findings from store that match query
        # In production, this would fetch from actual sources
        findings = state['findings']
        matching = [
            f for f in findings
            if query.lower() in f.get('title', '').lower() or
               query.lower() in f.get('snippet', '').lower()
        ]

        # Sort by date and limit
        matching.sort(
            key=lambda x: x.get('publishedAt') or '',
            reverse=True
        )
        matching = matching[:limit]

        return {
            'findings': [
                {
                    'id': f['id'],
                    'title': f.get('title'),
                    'url': f.get('url'),
                    'snippet': f.get('snippet'),
                    'publishedAt': f.get('publishedAt'),
                    'sourceType': f.get('sourceType'),
                    'sourceName': f.get('sourceName'),
                    'author': f.get('author', '')
                }
                for f in matching
            ],
            'total': len(matching)
        }

    def get_status(self, watcher_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get current monitoring tasks and latest findings

        Args:
            watcher_id: Optional specific watcher ID to filter

        Returns:
            Status object with watchers, findings, and statistics
        """
        state = self.store.get_state()

        watchers = state['watchers']
        if watcher_id:
            watchers = [w for w in watchers if w['id'] == watcher_id]

        findings = state['findings']
        if watcher_id:
            findings = [f for f in findings if f.get('watcherId') == watcher_id]

        # Sort findings by date
        findings.sort(
            key=lambda x: x.get('detectedAt', ''),
            reverse=True
        )

        return {
            'watchers': [
                {
                    'id': w['id'],
                    'name': w['name'],
                    'query': w['query'],
                    'enabled': w['enabled'],
                    'intervalMinutes': w['intervalMinutes'],
                    'lastRunAt': w.get('lastRunAt'),
                    'notificationChannels': w['notificationChannels']
                }
                for w in watchers
            ],
            'recentFindings': [
                {
                    'id': f['id'],
                    'watcherId': f.get('watcherId'),
                    'title': f.get('title'),
                    'url': f.get('url'),
                    'sourceName': f.get('sourceName'),
                    'detectedAt': f.get('detectedAt'),
                    'aiDecision': f.get('aiDecision')
                }
                for f in findings[:10]
            ],
            'totalFindings': len(findings),
            'totalWatchers': len(watchers)
        }

    def configure_sources(self, source_id: str, enabled: Optional[bool] = None,
                         config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Enable, disable, or configure information sources

        Args:
            source_id: Source ID to configure
            enabled: Enable/disable the source
            config: Configuration object for the source

        Returns:
            Updated source object
        """
        updates = {}
        if enabled is not None:
            updates['enabled'] = enabled
        if config is not None:
            updates['config'] = config

        source = self.store.update_source(source_id, updates)

        return {
            'id': source['id'],
            'name': source['name'],
            'type': source['type'],
            'enabled': source['enabled'],
            'config': source['config']
        }

    def fetch_item_details(self, finding_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific finding

        Args:
            finding_id: Finding ID

        Returns:
            Detailed finding object
        """
        finding = self.store.get_finding(finding_id)
        if not finding:
            raise ValueError(f"Finding not found: {finding_id}")

        return {
            'id': finding['id'],
            'title': finding.get('title'),
            'url': finding.get('url'),
            'snippet': finding.get('snippet'),
            'publishedAt': finding.get('publishedAt'),
            'detectedAt': finding.get('detectedAt'),
            'sourceType': finding.get('sourceType'),
            'sourceName': finding.get('sourceName'),
            'author': finding.get('author'),
            'metrics': finding.get('metrics', {}),
            'quality': finding.get('quality', {}),
            'raw': finding.get('raw', {})
        }


def main():
    """CLI entry point for skills"""
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No skill specified'}), file=sys.stderr)
        sys.exit(1)

    skill_name = sys.argv[1]

    try:
        # Parse input from stdin or command line
        if len(sys.argv) > 2:
            params = json.loads(sys.argv[2])
        else:
            params = json.load(sys.stdin)

        skills = HotMonitorSkills()

        # Route to appropriate skill
        if skill_name == 'monitor-topic':
            result = skills.monitor_topic(**params)
        elif skill_name == 'search-findings':
            result = skills.search_findings(**params)
        elif skill_name == 'get-status':
            result = skills.get_status(**params)
        elif skill_name == 'configure-sources':
            result = skills.configure_sources(**params)
        elif skill_name == 'fetch-item-details':
            result = skills.fetch_item_details(**params)
        else:
            print(json.dumps({'error': f'Unknown skill: {skill_name}'}), file=sys.stderr)
            sys.exit(1)

        # Output with UTF-8 encoding
        output = json.dumps(result, ensure_ascii=False, indent=2)
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.write(b'\n')

    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
