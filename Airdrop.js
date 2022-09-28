const fs = require('fs');
const xrpl = require('xrpl')

//LOCALLY MADE COMMANDS
const {currentledger} = require("./Functions/currentledger")
const {getalltls} = require("./Functions/getalltls")
const {wait} = require("./Functions/wait")
const {savejson} = require('./Functions/savejson')
const {round} = require('./Functions/round')
const {accountsequence} = require('./Functions/accountsequence')
const {submit} = require("./Functions/submit")
const {savecsv} = require('./Functions/savecsv')
const {checktxid} = require(`./Functions/checktxid`)
const {readjson} = require(`./Functions/readjson`)
const {
    xconnect,
    xReconnect
} = require('./Functions/xrplConnect')


//config file reporting
const {
    nodes,
    tokens,
    errorMargin,
    Fee,
    retrymax
} = require('./config.json');

//Define initial client
var client = new xrpl.Client(nodes[0])


//Error Handling
process.on('unhandledRejection', async (reason, promise) => {
    try{
    fs.writeFileSync(`./data/ADRun${a}.json`, data)
    } catch{}
    var error = `Unhandled rejection at, ${promise}, reason: ${reason}`;
    console.log(error)
    fs.writeFileSync("./ERRORS.txt", `\nUnhandled Rejection: ${error}`)
    process.exit(1)
});

process.on('uncaughtException', async (err) => {
    try{
        fs.writeFileSync(`./data/ADRun${a}.json`, data)
        } catch{}
    console.log(`Uncaught Exception: ${err.message}`)
    fs.writeFileSync("./ERRORS.txt", `\nUncaught Exception: ${err.message}`)
    process.exit(1)
});

async function main() {
    
    console.log(`\n\n\n—————\nThis Tool Was Developed, For Public Use, by OnChain Whales\nPlease visit our website @ onchainwhales.net to see just what we can bring to the NFTs on the XRPL\nTwitter: @onchainwhales\nEmail: josh@onchainwhales.net\n—————\n`)

    //make data folder to store progress
    if (!(fs.existsSync(`./data`))) fs.mkdirSync(`./data`)

    //connect to XRPL
    client = await xconnect(client, nodes)

    //reconnect unpon disconnect
    client.on('disconnected', async () => {
        client = await xReconnect(client, nodes);
    });

    //Get current validated ledger
    var searchCount = 0
    while (searchCount < retrymax) {
        try {
            var current = await currentledger(client, "validated") //returns [ledgerindex, ledgertime]
            var currentledgerindex = current[0]
            var currentledgertime = xrpl.rippleTimeToUnixTime(current[1]) / 1000
            console.log(`The time since Epoch is ${currentledgertime} seconds, LedgerIndex is ${currentledgerindex}`)
            break
        } catch (err) {
            console.log(`Error Getting Current Ledger ${searchCount}`)
            searchCount += 1

            if (searchCount == retrymax) {
                fs.writeFileSync("./ERRORS.txt", `\nCOULDN"T GET CURRENT LEDGER\n LIKELY TO BE AN ISSUE WITH WEBSOCKET OR INTERNET CONNECTION`)
                process.exit(1)
            }
        }
    }
    await savecsv(`./data/startedatthistime.txt`, `The time since Epoch is ${currentledgertime} seconds, LedgerIndex is ${currentledgerindex}`)

    //do this for each token
    for (a in tokens) {
        var current = tokens[a]
        var name = current.name
        var hex = current.hex
        var issuer = current.issuer
        var total = current.total
        var saveFrequency = current.saveFrequency
        var memohex = xrpl.convertStringToHex(current.memo)
        var blackList = current.blackList

        //tries to get wallet from seed, if not gets from mnemonic
        try{
            var wallet = xrpl.Wallet.fromSeed(current.seedOfWallet)
        } catch (err){
            console.log(`\nAn Invalid Seed Was Supplied, Deriving Wallet As A Mnemonic Input\nPlease confirm your address is correct`)
            var wallet = xrpl.Wallet.fromMnemonic(current.seedOfWallet)
        }
        var ADobj = {}

        console.log(`\n\n<<<< CONDUCTING AD ${a} FOR A TOTAL OF ${total} $${name} >>>>\nFROM ADDRESS: ${wallet.classicAddress}\nYOU HAVE 20 SECONDS TO CONFIRM THESE DETAILS ARE CORRECT`)
        await wait(20)
        console.log(`PROCEEDING`)

        //If data from previous run exists, use that, if not compile snapshot according to data set in config file
        if (fs.existsSync(`./data/ADRun${a}.json`)) {
            var data = await readjson(`./data/ADRun${a}.json`)
        } else {

            //get Snapshot Data 
            if (current.holdersAD || !(current.suppliedAccounts)) {
                if (current.snapShotnow) {
                    var ledgerSS = currentledgerindex
                } else {
                    var ledgerSS = current.ledgerOfSnapshot
                }
                console.log(`Snapshotting all Trustlines for $${name} During LedgerSequence ${ledgerSS}`)
                //tries 5 times, then ditches
                var checkCount = 0
                while (checkCount < retrymax) {
                    try {
                        var snapshot = await getalltls(client, issuer, ledgerSS)
                        console.log(`SNAPSHOT TAKEN FOR $${name}`)
                        break
                    } catch (err) {
                        console.log(`Error Taking Snapshot ${checkCount}`)
                        checkCount += 1
                    }

                    if (checkCount == retrymax) {
                        fs.writeFileSync("./ERRORS.txt", `\nCOULDN"T SNAPSHOT TOKEN ${name} FROM VARIABLE ${a}\n LIKELY TO BE AN ISSUE WITH DATA INPUTTED INTO THE CONFIG FILE (OR CONNECTIONS/WEBSOCKET)`)
                        process.exit(1)
                    }
                }

                var allHoldings = 0
                for (c in snapshot) {
                    if (blackList.includes(snapshot[c].account)) continue

                    if (snapshot[c].currency == hex) {

                        allHoldings += Math.abs((Number(snapshot[c].balance)))
                    }
                }

                console.log(`\nA Total Of ${allHoldings} of $${name} is Circulating`)

                for (d in snapshot) {
                    if (blackList.includes(snapshot[d].account)) continue

                    if (snapshot[d].currency == hex) {

                        var holding = Math.abs((Number(snapshot[d].balance)))

                        if (current.holdersAD) {
                            var recieve = round(((total * errorMargin) / allHoldings) * holding, 8)
                            if (recieve > 0) {
                                ADobj[snapshot[d].account] = recieve
                            }
                        } else {
                            var tokensPeraccount = ((total * errorMargin) / (snapshot.length))
                            for (b in snapshot) {
                                var address = snapshot[b]
                                if (!(xrpl.isValidAddress(address))) continue
                                if (address in ADobj) continue

                                ADobj[address] = tokensPeraccount
                            }
                        }
                    }
                }

            }

            if (current.suppliedAccounts) {
                if (current.holdersAD) {
                    console.log(`YOU CANNOT HAVE holdersAD SET TO true, AND suppliedAccounts SET TO true IN THE CONFIG\nEXITING PROGRAM`)
                    fs.writeFileSync("./ERRORS.txt", `\nYOU CANNOT HAVE holdersAD SET TO true, AND suppliedAccounts SET TO true IN THE CONFIG`)
                    process.exit(1)
                }
                console.log(`USING SUPPLIED ARRAY OF ADDRESSES FROM ${current.pathToJsonArrayOfAddresses}`)
                var snapshot = await readjson(current.pathToJsonArrayOfAddresses)
                var tokensPeraccount = ((total * errorMargin) / (snapshot.length))
                for (b in snapshot) {
                    var address = snapshot[b]
                    if (!(xrpl.isValidAddress(address))) continue
                    if (address in ADobj) continue

                    ADobj[address] = tokensPeraccount
                }
            }



            //Make objet to store AD data in
            var data = {}
            var keys = Object.keys(ADobj)
            for (b in keys) {
                var name = "Account" + (Number(b) + 1)
                if (blackList.includes(keys[b])) continue
                if (wallet.classicAddress == keys[b]) continue

                data[name] = {
                    Address: keys[b],
                    Airdrop: ADobj[keys[b]],
                    TxID: "",
                    Status: ""
                }
            }
            await savejson(`./data/ADRun${a}.json`, data)
        }

        //GET CURRENT SEQUENCE
        console.log(`\nGETTING ACCOUNT SEQUENCE`)
        var searchCount = 0
        while (searchCount < retrymax) {
            try {
                var current_sequence = await accountsequence(client, wallet.classicAddress)
                console.log(`ACCOUNT SEQUENCE: ${current_sequence}`)
                break
            } catch (err) {
                console.log("Couldn't Get Account Sequence")
                searchCount += 1

                if (searchCount == retrymax) {
                    fs.writeFileSync("./ERRORS.txt", `\nCOULDN"T GET ACCOUNT SEQUENCE FOR ${wallet.classicAddress} ${a}\n LIKELY TO BE AN ISSUE WITH  CONNECTIONS/WEBSOCKET`)
                    process.exit(1)
                }
            }
        }

        //BEGIN SENDING TRANSACTIONS
        console.log("\n\n__SENDING INITIAL TRANSACTIONS__")
        var keys = Object.keys(data)
        var sequencecount = 0
        console.time("RUNNTIME");
        for (b in keys) {
            var key = keys[b]
            var accountAdd = data[key].Address
            var txid = data[key].TxID
            var status = data[key].Status
            var valueSend = round(data[key].Airdrop, 8)

            if (status != "") continue

            if (txid != "") continue

            if (valueSend == 0) {
                data[key].TxID = "N/A"
                continue;
            }

            var new_sequence = current_sequence + sequencecount

            //Checks ledger every 1000 transactions, and resets the last_ledger variable about 1hr ahead
            if (sequencecount % 1000 == 0) {

                console.log("Getting Current Ledger Sequence...")
                var searchCount = 0
                while (searchCount < retrymax) {
                    try {
                        var current = await currentledger(client, "validated") //returns [ledgerindex, ledgertime]
                        var last_ledger = (Number(current[0]) + 1200)
                        break
                    } catch (err) {
                        console.log("Couldn't Find Ledger Sequence")
                        searchCount += 1
                    }

                    if (searchCount == retrymax) {
                        last_ledger += 1200
                    }
                }
            }

            //send AD
            var prepared = {
                "TransactionType": "Payment",
                "Account": wallet.classicAddress,
                "Destination": accountAdd,
                "Fee": Fee,
                "Sequence": new_sequence,
                "Memos": [{
                    "Memo": {
                        "MemoData": memohex,
                    }
                }],
                "DestinationTag": 1,
                "Amount": {
                    "currency": hex,
                    "value": valueSend,
                    "issuer": issuer
                },
                "LastLedgerSequence": last_ledger
            }


            //tries 5 times to submit, otherwise it registers it as nothing and will be shown in the output result
            var submitCount = 0
            while (submitCount < retrymax) {
                try {
                    var txID = await submit(client, prepared, wallet)
                    console.log(`\nSubmitted Transaction ${sequencecount} of ${keys.length}, for ${valueSend} $${name} -> ${accountAdd} -> ${txID}`)
                    break
                } catch (err) {
                    console.log(`Error Submitting ${submitCount}`)
                    submitCount += 1
                }

                if (submitCount == retrymax) {
                    var txID = ""
                    var sequencecount = sequencecount - 1
                }
            }

            data[key].TxID = txID
            sequencecount += 1

            //save data as frequently as specified
            if (sequencecount % saveFrequency == 0) {
                await savejson(`./data/ADRun${a}.json`, data)
            }
        }

        console.log("\n\n")
        console.timeEnd("RUNNTIME")
        console.log(`DISTRIBUTED ${keys.length} ADs`)

        await savejson(`./data/ADRun${a}.json`, data)



        console.log("\n\nWAITING 10 SECONDS BEFORE CHECKING TxID RESULTS")
        await wait(10)

        //CHECK TXID
        console.log("__CHECKING TxID__")
        var successCount = 0
        var failCount = 0
        for (b in keys) {
            var key = keys[b]
            var txid = data[key].TxID
            var status = data[key].Status

            if (status != "") continue
            if (txid == "N/A") continue

            var submitCount = 0
            while (submitCount < retrymax) {
                try {
                    var status = await checktxid(client, txid)
                    console.log(`${key} -> ${b} of ${keys.length} -> ${status}`)
                    var successCount = successCount + 1
                    break
                } catch (err) {
                    submitCount += 1
                }

                if (submitCount == retrymax) {
                    console.log(`${key} -> ${b} of ${keys.length} -> Failed`)
                    failCount += 1
                    var status = ""
                }
            }

            data[key].Status = status
        }

        await savejson(`./data/ADRun${a}.json`, data)

        console.log(
            "\nNumber of Successful Transactions: " + successCount +
            "\nNumber of Failed Transactions: " + failCount + "\n\n"
        )


        //RETRY FAILED Tx until all have been submited/validated
        var totalRetry = 0
        while (failCount != 0) {
            var totalRetry = totalRetry + 1

            //GET CURRENT SEQUENCE
            var searchCount = 0
            while (searchCount < retrymax) {
                try {
                    var current_sequence = await accountsequence(client, wallet.classicAddress)
                    console.log(`ACCOUNT SEQUENCE: ${current_sequence}`)
                    break
                } catch (err) {
                    console.log("Couldn't Get Account Sequence")
                    searchCount += 1

                    if (searchCount == retrymax) {
                        fs.writeFileSync("./ERRORS.txt", `\nCOULDN"T GET ACCOUNT SEQUENCE FOR ${wallet.classicAddress} ${a}\n LIKELY TO BE AN ISSUE WITH  CONNECTIONS/WEBSOCKET`)
                        process.exit(1)
                    }
                }
            }

            //CHECK TXID
            console.log(`\n\n__RETRYING FAILED, ROUND ${totalRetry}__`)
            var sequencecount = 0
            for (b = 0; b < keys.length; b++) {
                var key = keys[b]
                var accountAdd = data[key].Address
                var txid = data[key].TxID
                var status = data[key].Status
                var valueSend = round(data[key].Airdrop, 8)

                if (status != "") continue


                if (valueSend == 0) {
                    data[key].TxID = "N/A"
                    continue;
                }

                var new_sequence = current_sequence + sequencecount

                //Checks ledger every 1000 transactions, and resets the last_ledger variable about 1hr ahead
                if (sequencecount % 1000 == 0) {

                    console.log("Getting Current Ledger Sequence...")
                    //tries 5 times, then adds it ontop of the old one
                    var searchCount = 0
                    while (searchCount < retrymax) {
                        try {
                            var current = await currentledger(client, "validated") //returns [ledgerindex, ledgertime]
                            var last_ledger = (Number(current[0]) + 1200)
                            break
                        } catch (err) {
                            console.log("Couldn't Find Ledger Sequence")
                            searchCount += 1
                        }

                        if (searchCount == retrymax) {
                            last_ledger += 1200
                        }
                    }

                }

                var prepared = {
                    "TransactionType": "Payment",
                    "Account": wallet.classicAddress,
                    "Destination": accountAdd,
                    "Fee": Fee,
                    "Sequence": new_sequence,
                    "Memos": [{
                        "Memo": {
                            "MemoData": memohex,
                        }
                    }],
                    "DestinationTag": 1,
                    "Amount": {
                        "currency": hex,
                        "value": valueSend,
                        "issuer": issuer
                    },
                    "LastLedgerSequence": last_ledger
                }


                //tries 5 times to submit, otherwise it registers it as nothing and will be shown in the output result
                var submitCount = 0
                while (submitCount < retrymax) {
                    try {
                        var txID = await submit(client, prepared, wallet)
                        console.log(`\nSubmitted Transaction ${sequencecount} of ${keys.length}, for ${valueSend} $${name} -> ${accountAdd} -> ${txID}`)
                        break
                    } catch (err) {
                        console.log(`Error Submitting ${submitCount}`)
                        submitCount += 1
                    }

                    if (submitCount == retrymax) {
                        var txID = ""
                        var sequencecount = sequencecount - 1
                    }
                }


                data[key].TxID = txID
                sequencecount += 1

                //save data as frequently as specified
                if (sequencecount % saveFrequency == 0) {
                    await savejson(`./data/ADRun${a}.json`, data)
                }


            }

            console.log("\n\nWAITING 10 SECONDS BEFORE CHECKING TxID RESULTS")
            await wait(10)

            //CHECK TXID
            console.log("__CHECKING TxID__")
            var successCount = 0
            var failCount = 0
            for (b in keys) {
                var key = keys[b]
                var txid = data[key].TxID
                var status = data[key].Status

                if (status != "") continue
                if (txid == "N/A") continue

                //tries 5 times to submit, otherwise it registers it as nothing and will be shown in the output result
                var submitCount = 0
                while (submitCount < retrymax) {
                    try {
                        var status = await checktxid(client, txid)
                        console.log(`${key} -> ${b} of ${keys.length} -> ${status}`)
                        var successCount = successCount + 1
                        break
                    } catch (err) {
                        submitCount += 1
                    }

                    if (submitCount == retrymax) {
                        console.log(`${key} -> ${b} of ${keys.length} -> Failed To Check`)
                        failCount += 1
                        var status = ""
                    }
                }

                data[key].Status = status
            }

            await savejson(`./data/ADRun${a}.json`, data)


            console.log(
                "\nNumber of Successful Transactions: " + successCount +
                "\nNumber of Failed Transactions: " + failCount + "\n\n"
            )
        }

        await savejson(`./data/ADRun${a}.json`, data)
        await wait(5)

        //Make .csv/excel table of the result, to easily read
        console.log("MAKING EXCEL TABLE")

        var header = "Address,Airdrop Sent,Transaction ID, Status"
        fs.appendFileSync(`./data/Final${a}.csv`, header)

        var keys = Object.keys(data)
        for (x = 0; x < keys.length; x++) {
            var key = keys[x]
            var accountAdd = data[key].Address
            var valueSend = round(data[key].Airdrop, 4)
            var txid = data[key].TxID
            var status = data[key].Status

            var text = `\n${accountAdd},${valueSend},${txid},${status}`
            fs.appendFileSync(`./data/Final${a}.csv`, text)
        }

        console.log(`_____COMPLETED AD ${a}_____`)
    }

    console.log(`\n\n\nALL ADs ARE DONE`)
    console.log(`\n\n\n—————\nWebsite @ onchainwhales.net\nTwitter: @onchainwhales\nEmail: josh@onchainwhales.net—————\n`)
    process.exit(1)
}
main()
