#!/bin/zsh
set -euo pipefail

out="/Users/villedajr/SpotLift/docs/pitch-competitions/gsic-slides-edit/appstore"
mkdir -p "$out"

curl -L --fail --silent --show-error 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/6b/ea/8c/6bea8c2d-c62c-a290-460f-32bb7f45b040/01_AI_Camera_Scanner.png/1242x2688bb.png' -o "$out/01-camera.png"
curl -L --fail --silent --show-error 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/2c/25/4f/2c254fc3-461b-98a5-7d83-c90fc3a5c6e6/02_Your_Gym_Finally_Explained.png/1242x2688bb.png' -o "$out/02-home.png"
curl -L --fail --silent --show-error 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/79/fb/9c/79fb9c28-2a86-3ced-d270-f81b1e0ab6f1/03_Search_Any_Workout.png/1242x2688bb.png' -o "$out/03-search.png"
curl -L --fail --silent --show-error 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/b5/0f/dd/b50fddaa-e017-a02a-265e-008470c7d5a3/04_See_Every_Muscle.png/1242x2688bb.png' -o "$out/04-muscles.png"
curl -L --fail --silent --show-error 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/95/ca/99/95ca99fb-997a-d9f8-d282-fc01b8ea2c94/08_Personalized_Starting_Load.png/1242x2688bb.png' -o "$out/08-load.png"
curl -L --fail --silent --show-error 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/d7/6b/d6/d76bd6ed-074f-6bcb-57d5-369c22157744/09_Coach_Chat.png/1242x2688bb.png' -o "$out/09-coach.png"
curl -L --fail --silent --show-error 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/8f/3d/4d/8f3d4ddc-f653-cdac-9778-c26486e585ee/10_Build_Your_Week.png/1242x2688bb.png' -o "$out/10-week.png"

file "$out"/*.png
