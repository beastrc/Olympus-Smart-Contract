// @dev. This script will deploy this V1.1 of Olympus. It will deploy the whole ecosystem except for the LP tokens and their bonds. 
// This should be enough of a test environment to learn about and test implementations with the Olympus as of V1.1.
// Not that the every instance of the Treasury's function 'valueOf' has been changed to 'valueOfToken'... 
// This solidity function was conflicting w js object property name

const { ethers } = require("hardhat");
const colors = require('colors');

function delay(delayTimes) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(2);
      }, delayTimes);
    });
  }

async function main() {

    const [deployer] = await ethers.getSigners();
    var DAO = {address :process.env.DAO};
    console.log('Deploying contracts with the account: ' + deployer.address);
    console.log('Deploying contracts with the account: ' + DAO.address);

    // Initial staking index
    const initialIndex = '7675210820';

    // First block epoch occurs
    const firstEpochBlock = '21216290';

    // What epoch will be first epoch
    const firstEpochNumber = '50487';

    // How many blocks are in each epoch
    const epochLengthInBlocks = '2200';

    // Initial reward rate for epoch
    const initialRewardRate = '3000';

    // Ethereum 0 address, used when toggling changes in treasury
    const zeroAddress = '0x0000000000000000000000000000000000000000';

    // DAI bond BCV
    const daiBondBCV = '369';

    // Frax bond BCV
    const wFTMBondBCV = '690';

    // Bond vesting length in blocks. 33110 ~ 5 days
    const bondVestingLength = '33110';

    // Min bond price
    const minBondPrice = '50000';

    // Max bond payout
    const maxBondPayout = '50'

    // DAO fee for bond
    const bondFee = '10000';

    // Max debt bond can take on
    const maxBondDebt = '1000000000000000';

    // Initial Bond debt
    const intialBondDebt = '0'

    // Deploy PIP
    const PIP = await ethers.getContractFactory('OlympusERC20Token');
    const pip = await PIP.deploy();
    await pip.deployed();

    const dai = {address : process.env.DAI};

    const wFTM = {address : process.env.WFTM};
    

    console.log("--------------deploy PIP finish----------------")
    // Deploy treasury
    //@dev changed function in treaury from 'valueOf' to 'valueOfToken'... solidity function was coflicting w js object property name
    const Treasury = await ethers.getContractFactory('OlympusTreasury'); 
    const treasury = await Treasury.deploy( pip.address, dai.address, wFTM.address, 0 );
    await treasury.deployed();

    // Deploy bonding calc
    const OlympusBondingCalculator = await ethers.getContractFactory('OlympusBondingCalculator');
    const olympusBondingCalculator = await OlympusBondingCalculator.deploy( pip.address );
    await olympusBondingCalculator.deployed();

    // Deploy staking distributor
    const Distributor = await ethers.getContractFactory('Distributor');
    const distributor = await Distributor.deploy(treasury.address, pip.address, epochLengthInBlocks, firstEpochBlock);
    await distributor.deployed();
    
    // Deploy sPIP
    const SPIP = await ethers.getContractFactory('sOlympus');
    const sPIP = await SPIP.deploy();
    await sPIP.deployed();
    
    // Deploy Staking
    const Staking = await ethers.getContractFactory('OlympusStaking');
    const staking = await Staking.deploy( pip.address, sPIP.address, epochLengthInBlocks, firstEpochNumber, firstEpochBlock );
    await staking.deployed();
    
    // Deploy staking warmpup
    const StakingWarmpup = await ethers.getContractFactory('StakingWarmup');
    const stakingWarmup = await StakingWarmpup.deploy(staking.address, sPIP.address);
    await stakingWarmup.deployed();
    
    // Deploy staking helper
    const StakingHelper = await ethers.getContractFactory('StakingHelper');
    const stakingHelper = await StakingHelper.deploy(staking.address, pip.address);
    await stakingHelper.deployed();
    
    //@dev changed function call to Treasury of 'valueOf' to 'valueOfToken' in BondDepository due to change in Treausry contract
    const DAIBond = await ethers.getContractFactory('OlympusBondDepository');
    var daiBond;
    try {
        daiBond = await DAIBond.deploy(pip.address, dai.address, treasury.address, DAO.address, zeroAddress);
        await daiBond.deployed();
    }catch(err){
    console.log("DAOERROR",err)
    }

    console.log("--------------deploy finish----------------")
    // Deploy Frax bond
    //@dev changed function call to Treasury of 'valueOf' to 'valueOfToken' in BondDepository due to change in Treausry contract
    const WFTMBond = await ethers.getContractFactory('OlympusBondDepository');
    const wFTMBond = await WFTMBond.deploy(pip.address, wFTM.address, treasury.address, DAO.address, zeroAddress);
    await wFTMBond.deployed();
   
    // queue and toggle DAI and Frax bond reserve depositor
    var tx = await treasury.queue('0', daiBond.address);
    await tx.wait();
    tx = await treasury.queue('0', wFTMBond.address);
    await tx.wait();
    tx = await treasury.toggle('0', daiBond.address, zeroAddress);
    await tx.wait();
    tx = await treasury.toggle('0', wFTMBond.address, zeroAddress);
    await tx.wait();

    // Set DAI and Frax bond terms
    tx = await daiBond.initializeBondTerms(daiBondBCV, bondVestingLength, minBondPrice, maxBondPayout, bondFee, maxBondDebt, intialBondDebt);
    await tx.wait();
    tx = await wFTMBond.initializeBondTerms(wFTMBondBCV, bondVestingLength, minBondPrice, maxBondPayout, bondFee, maxBondDebt, intialBondDebt);
    await tx.wait();

    // Set staking for DAI and Frax bond
    tx = await daiBond.setStaking(staking.address, stakingHelper.address);
    await tx.wait();
    tx = await wFTMBond.setStaking(staking.address, stakingHelper.address);
    await tx.wait();

    // Initialize sPIP and set the index
    tx = await sPIP.initialize(staking.address);
    await tx.wait();
    tx = await sPIP.setIndex(initialIndex);
    await tx.wait();

    // set distributor contract and warmup contract
    tx = await staking.setContract('0', distributor.address);
    await tx.wait();
    tx = await staking.setContract('1', stakingWarmup.address);
    await tx.wait();

    // Set treasury for PIP token
    tx = await pip.setVault(treasury.address);
    await tx.wait();

    // Add staking contract as distributor recipient
    tx = await distributor.addRecipient(staking.address, initialRewardRate);
    await tx.wait();

    // queue and toggle reward manager
    tx = await treasury.queue('8', distributor.address);
    await tx.wait();
    await delay(3000);
    tx = await treasury.toggle('8', distributor.address, zeroAddress);
    await tx.wait();
    await delay(3000);

    // queue and toggle deployer reserve depositor
    tx = await treasury.queue('0', deployer.address);
    await delay(6000);
    tx = await treasury.toggle('0', deployer.address, zeroAddress);
    await delay(6000);

    console.log( "final : ",deployer.address);
    // queue and toggle liquidity depositor
    tx = await treasury.queue('4', deployer.address, );
    await delay(6000);
    
    console.log( "final : ",deployer.address);
    tx = await treasury.toggle('4', deployer.address, zeroAddress);
    await delay(6000);

    // Stake PIP through helper
    var tx = await pip.approve(stakingHelper.address,'100000000000');
    await delay(1000);

    var tx = await stakingHelper.stake('100000000000');
    await tx.wait();

    // var daiLP = await exchangeFactory.getPair(pip.address,dai.address);
    // var wFTMLP = await exchangeFactory.getPair(pip.address,dai.address);

    console.log( "DAI_ADDRESS: ",dai.address);
    console.log( "PIP_ADDRESS: ",pip.address);
    console.log( "STAKING_ADDRESS: ",staking.address);
    console.log( "STAKING_HELPER_ADDRESS: ",stakingHelper.address);
    console.log( "SPIP_ADDRESS: ",sPIP.address);
    console.log( "DISTRIBUTOR_ADDRESS: ",distributor.address);
    console.log( "BONDINGCALC_ADDRESS: ",olympusBondingCalculator.address);
    console.log( "TREASURY_ADDRESS: ",treasury.address);

    console.log( "bondAddress: ",daiBond.address);
    // console.log( "reserveAddress: ",daiLP);
    console.log( "bondAddress: ",wFTMBond.address);
    // console.log( "reserveAddress: ",wFTMLP);

    console.log( "PIP: " + pip.address );
    console.log( "DAI: " + dai.address );
    console.log( "Frax: " + wFTM.address );
    console.log( "Treasury: " + treasury.address );
    console.log( "Calc: " + olympusBondingCalculator.address );
    console.log( "Staking: " + staking.address );
    console.log( "sPIP: " + sPIP.address );
    console.log( "Distributor: " + distributor.address);
    console.log( "Staking Wawrmup: " + stakingWarmup.address);
    console.log( "Staking Helper: " + stakingHelper.address);
    console.log("DAI Bond: " + daiBond.address);
    console.log("Frax Bond: " + wFTMBond.address);
}

main()
    .then(() => process.exit())
    .catch(error => {
        console.error(error);
        process.exit(1);
})