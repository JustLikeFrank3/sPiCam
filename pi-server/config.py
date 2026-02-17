"""
Configuration management for sPiCam server
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

#Human: let me just commit this work in progress so i can switch back to main when that app is done building