right click SSH on railway and ssh to it
command:
nohup tar -cf /app/data/backup_8gb.tar -C /app/data uploads storyboard.db &

Target
apt-get update && apt-get install -y magic-wormhole
wormhole send /app/data/backup_8gb.tar

>> Receive the File (Windows CMD)

pip install magic-wormhole
wormhole receive