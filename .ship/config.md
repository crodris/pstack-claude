# ship pipeline profile
verify: node convert.mjs --check && claude plugin validate . && claude plugin validate plugin && bin/scan-skills.sh   # asked
