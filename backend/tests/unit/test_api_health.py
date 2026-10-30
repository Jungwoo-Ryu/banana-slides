"""
Health screening API Unit Test
"""

import pytest


class TestHealthEndpoint:
    """Health examination endpoint test"""

    def test_health_check_returns_ok(self, client):
        """Test health check back to normal."""
        response = client.get('/health')

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'ok'
        assert 'message' in data

    def test_health_check_response_format(self, client):
        """Testing the health check response format"""
        response = client.get('/health')

        data = response.get_json()
        assert isinstance(data, dict)
        assert 'status' in data
        assert 'message' in data

