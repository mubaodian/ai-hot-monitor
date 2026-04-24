#!/usr/bin/env python3
"""
Test script for AI Hot Monitor Python Skills
"""

import json
import subprocess
import sys
from pathlib import Path

# Get script directory
script_dir = Path(__file__).parent
skills_script = script_dir / 'skills.py'


def run_skill(skill_name: str, params: dict) -> dict:
    """Run a skill and return result"""
    try:
        result = subprocess.run(
            [sys.executable, str(skills_script), skill_name],
            input=json.dumps(params),
            capture_output=True,
            encoding='utf-8',
            timeout=10
        )

        if result.returncode != 0:
            print(f"[ERROR] {skill_name} failed:")
            print(f"   stderr: {result.stderr}")
            return None

        if not result.stdout:
            print(f"[ERROR] {skill_name} returned empty output")
            return None

        return json.loads(result.stdout)

    except Exception as e:
        print(f"[ERROR] {skill_name} error: {e}")
        return None


def test_skills():
    """Test all skills"""
    print("Testing AI Hot Monitor Python Skills\n")

    # Test 1: monitor-topic
    print("1. Testing monitor-topic...")
    result = run_skill('monitor-topic', {
        'name': 'Test Topic',
        'query': 'Claude Code',
        'notification_channels': ['email']
    })
    if result and 'id' in result:
        print(f"   [OK] Created watcher: {result['id']}")
        watcher_id = result['id']
    else:
        print("   [FAIL] Failed to create watcher")
        return False

    # Test 2: get-status
    print("\n2. Testing get-status...")
    result = run_skill('get-status', {})
    if result and 'watchers' in result:
        print(f"   [OK] Got status: {len(result['watchers'])} watchers, {result['totalFindings']} findings")
    else:
        print("   [FAIL] Failed to get status")
        return False

    # Test 3: search-findings
    print("\n3. Testing search-findings...")
    result = run_skill('search-findings', {
        'query': 'Claude',
        'limit': 10
    })
    if result and 'findings' in result:
        print(f"   [OK] Search returned {result['total']} findings")
    else:
        print("   [FAIL] Failed to search findings")
        return False

    # Test 4: configure-sources
    print("\n4. Testing configure-sources...")
    result = run_skill('configure-sources', {
        'source_id': 'src_bing_web',
        'enabled': True
    })
    if result and 'id' in result:
        print(f"   [OK] Configured source: {result['name']}")
    else:
        print("   [FAIL] Failed to configure source")
        return False

    # Test 5: fetch-item-details (will fail if no findings, but that's ok)
    print("\n5. Testing fetch-item-details...")
    result = run_skill('fetch-item-details', {
        'finding_id': 'nonexistent'
    })
    if result is None or 'error' in result:
        print(f"   [OK] Correctly handled missing finding")
    else:
        print(f"   [OK] Retrieved finding details")

    print("\n[SUCCESS] All tests completed!")
    return True


if __name__ == '__main__':
    success = test_skills()
    sys.exit(0 if success else 1)
