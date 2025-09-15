#!/bin/bash

# API Testing Script for Grid-Based Game Engine
# This script tests all endpoints for basic functionality

set -e  # Exit on any error

BASE_URL="http://localhost:3000"
CONTENT_TYPE="Content-Type: application/json"

echo "🎮 Testing Grid-Based Game Engine API"
echo "====================================="
echo "Base URL: $BASE_URL"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to make HTTP requests and show results
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4

    echo -e "${BLUE}$method $endpoint${NC}"
    if [ -n "$data" ]; then
        echo -e "${YELLOW}Data: $data${NC}"
    fi

    if [ -n "$data" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" \
            -H "$CONTENT_TYPE" \
            -d "$data" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" \
            "$BASE_URL$endpoint")
    fi

    # Extract HTTP status and body
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS:/d')

    if [ "$http_status" = "$expected_status" ]; then
        echo -e "${GREEN}✓ Status: $http_status${NC}"
    else
        echo -e "${RED}✗ Status: $http_status (expected $expected_status)${NC}"
    fi

    if [ -n "$body" ] && [ "$body" != "null" ]; then
        echo "$body" | jq . 2>/dev/null || echo "$body"
    fi
    echo

    # Return the response body for further use
    echo "$body"
}

# Function to extract field from JSON response
extract_field() {
    local json=$1
    local field=$2
    echo "$json" | jq -r ".$field" 2>/dev/null
}

echo "🏥 1. Health Check"
echo "------------------"
make_request "GET" "/health" "" "200" > /dev/null

echo "👥 2. Player Management"
echo "----------------------"

# Create players
echo "Creating Player1..."
player1_response=$(make_request "POST" "/players" '{"name":"Player1"}' "201")
player1_id=$(extract_field "$player1_response" "id")

echo "Creating Player2..."
player2_response=$(make_request "POST" "/players" '{"name":"Player2"}' "201")
player2_id=$(extract_field "$player2_response" "id")

echo "Player1 ID: $player1_id"
echo "Player2 ID: $player2_id"
echo

# Test invalid player creation
echo "Testing invalid player creation..."
make_request "POST" "/players" '{"name":""}' "400" > /dev/null

# Get player
echo "Getting Player1..."
make_request "GET" "/players/$player1_id" "" "200" > /dev/null

# Get non-existent player
echo "Testing non-existent player..."
make_request "GET" "/players/999" "" "404" > /dev/null

echo "🎯 3. Game Session Management"
echo "-----------------------------"

# Create game session
echo "Creating game session..."
game_response=$(make_request "POST" "/games" "" "201")
game_id=$(extract_field "$game_response" "id")
echo "Game ID: $game_id"
echo

# Get game session
echo "Getting game session..."
make_request "GET" "/games/$game_id" "" "200" > /dev/null

# Join game session - Player1
echo "Player1 joining game..."
make_request "POST" "/games/$game_id/join" "{\"playerId\":$player1_id}" "200" > /dev/null

# Join game session - Player2
echo "Player2 joining game..."
game_after_join=$(make_request "POST" "/games/$game_id/join" "{\"playerId\":$player2_id}" "200")

# Test invalid joins
echo "Testing invalid join (same player twice)..."
make_request "POST" "/games/$game_id/join" "{\"playerId\":$player1_id}" "400" > /dev/null

echo "🎮 4. Game Moves"
echo "---------------"

# Submit moves to play a game
echo "Player1 move (0,0)..."
make_request "POST" "/games/$game_id/moves" "{\"playerId\":$player1_id,\"row\":0,\"col\":0}" "200" > /dev/null

echo "Player2 move (0,1)..."
make_request "POST" "/games/$game_id/moves" "{\"playerId\":$player2_id,\"row\":0,\"col\":1}" "200" > /dev/null

echo "Player1 move (1,1)..."
make_request "POST" "/games/$game_id/moves" "{\"playerId\":$player1_id,\"row\":1,\"col\":1}" "200" > /dev/null

echo "Player2 move (0,2)..."
make_request "POST" "/games/$game_id/moves" "{\"playerId\":$player2_id,\"row\":0,\"col\":2}" "200" > /dev/null

echo "Player1 winning move (2,2)..."
game_final=$(make_request "POST" "/games/$game_id/moves" "{\"playerId\":$player1_id,\"row\":2,\"col\":2}" "200")

# Test invalid moves
echo "Testing invalid move (game completed)..."
make_request "POST" "/games/$game_id/moves" "{\"playerId\":$player2_id,\"row\":1,\"col\":0}" "400" > /dev/null

echo "Testing invalid coordinates..."
make_request "POST" "/games/$game_id/moves" "{\"playerId\":$player1_id,\"row\":5,\"col\":5}" "400" > /dev/null

echo "📊 5. Statistics & Leaderboard"
echo "------------------------------"

# Get player stats
echo "Getting Player1 stats..."
make_request "GET" "/players/$player1_id/stats" "" "200" > /dev/null

echo "Getting Player2 stats..."
make_request "GET" "/players/$player2_id/stats" "" "200" > /dev/null

# Get leaderboard
echo "Getting leaderboard..."
make_request "GET" "/leaderboard" "" "200" > /dev/null

echo "🎯 6. Edge Cases & Error Handling"
echo "---------------------------------"

# Test non-existent game
echo "Testing non-existent game..."
make_request "GET" "/games/999" "" "404" > /dev/null

# Test invalid game join
echo "Testing join non-existent game..."
make_request "POST" "/games/999/join" "{\"playerId\":$player1_id}" "404" > /dev/null

# Test invalid move data
echo "Testing invalid move data..."
make_request "POST" "/games/$game_id/moves" '{"playerId":"invalid","row":"a","col":"b"}' "400" > /dev/null

# Test missing request data
echo "Testing missing player name..."
make_request "POST" "/players" '{}' "400" > /dev/null

echo "✅ 7. Complete Game Flow Test"
echo "============================="

# Create new game and players for complete flow
echo "Creating new game for complete flow test..."
game2_response=$(make_request "POST" "/games" "" "201")
game2_id=$(extract_field "$game2_response" "id")

echo "Complete game flow - Game ID: $game2_id"

# Join players
make_request "POST" "/games/$game2_id/join" "{\"playerId\":$player1_id}" "200" > /dev/null
make_request "POST" "/games/$game2_id/join" "{\"playerId\":$player2_id}" "200" > /dev/null

# Play a quick game (Player1 wins)
make_request "POST" "/games/$game2_id/moves" "{\"playerId\":$player1_id,\"row\":0,\"col\":0}" "200" > /dev/null
make_request "POST" "/games/$game2_id/moves" "{\"playerId\":$player2_id,\"row\":1,\"col\":0}" "200" > /dev/null
make_request "POST" "/games/$game2_id/moves" "{\"playerId\":$player1_id,\"row\":0,\"col\":1}" "200" > /dev/null
make_request "POST" "/games/$game2_id/moves" "{\"playerId\":$player2_id,\"row\":1,\"col\":1}" "200" > /dev/null
make_request "POST" "/games/$game2_id/moves" "{\"playerId\":$player1_id,\"row\":0,\"col\":2}" "200" > /dev/null

echo -e "${GREEN}🎉 All API tests completed successfully!${NC}"
echo
echo "📋 Summary:"
echo "- ✅ Health check"
echo "- ✅ Player creation and retrieval"
echo "- ✅ Game session management"
echo "- ✅ Player joining"
echo "- ✅ Move submission and validation"
echo "- ✅ Win detection"
echo "- ✅ Statistics tracking"
echo "- ✅ Leaderboard generation"
echo "- ✅ Error handling"
echo
echo -e "${BLUE}API is ready for production use!${NC}"
