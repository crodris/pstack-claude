# ship pipeline profile
verify: node convert.mjs --check && claude plugin validate --strict . && claude plugin validate --strict plugin && bin/scan-skills.sh   # asked
