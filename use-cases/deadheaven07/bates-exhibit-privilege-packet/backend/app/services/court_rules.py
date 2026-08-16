import json
from pathlib import Path
from typing import Any, Dict, Optional
from functools import lru_cache


class CourtRulesConfig:
    """Configuration loader for court rule profiles."""
    
    def __init__(self, config_path: Optional[Path] = None):
        if config_path is None:
            # Go up from app/services/ to backend/, then to config/
            config_path = Path(__file__).parent.parent.parent / "config" / "court_rules.json"
        self.config_path = config_path
        self._config: Optional[Dict[str, Any]] = None
    
    def load(self) -> Dict[str, Any]:
        """Load and return the court rules configuration."""
        if self._config is None:
            with open(self.config_path, "r") as f:
                self._config = json.load(f)
        return self._config
    
    def get_profile(self, profile_name: str) -> Dict[str, Any]:
        """Get a specific court rule profile by name."""
        config = self.load()
        profiles = config.get("profiles", {})
        if profile_name not in profiles:
            available = list(profiles.keys())
            raise ValueError(
                f"Profile '{profile_name}' not found. Available profiles: {available}"
            )
        return profiles[profile_name]
    
    def get_default_profile(self) -> Dict[str, Any]:
        """Get the default court rule profile."""
        config = self.load()
        default_name = config.get("default_profile", "SDNY_FEDERAL")
        return self.get_profile(default_name)
    
    def list_profiles(self) -> list[str]:
        """List all available profile names."""
        config = self.load()
        return list(config.get("profiles", {}).keys())
    
    def get_profile_names_with_descriptions(self) -> list[tuple[str, str]]:
        """Get list of (profile_name, display_name) tuples."""
        config = self.load()
        return [
            (name, profile.get("name", name)) 
            for name, profile in config.get("profiles", {}).items()
        ]


@lru_cache
def get_court_rules_config(config_path: Optional[Path] = None) -> CourtRulesConfig:
    """Get the singleton court rules configuration."""
    return CourtRulesConfig(config_path)


def get_profile(profile_name: Optional[str] = None, config_path: Optional[Path] = None) -> Dict[str, Any]:
    """Convenience function to get a court rule profile."""
    config = get_court_rules_config(config_path)
    if profile_name is None:
        return config.get_default_profile()
    return config.get_profile(profile_name)