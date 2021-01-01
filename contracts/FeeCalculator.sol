// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol"; // for WETH
import "./uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "./IPISBaseToken.sol";

contract FeeCalculator is OwnableUpgradeSafe {
    using SafeMath for uint256;

    function initialize(address _pisAddress) public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        pisTokenAddress = _pisAddress;
        feePercentX100 = 20;
        paused = true; // We start paused until sync post LGE happens.
        _editNoFeeList(pisTokenAddress, true); //this is to not apply fees for transfer from the token contrat itself
    }

    address pisTokenAddress;
    address pisVaultAddress;
    uint8 public feePercentX100; // max 255 = 25.5% artificial clamp
    bool paused;
    mapping(address => bool) public noFeeList;

    // PIS token is pausable
    function setPaused(bool _pause) public onlyOwner {
        paused = _pause;
    }

    function setFeeMultiplier(uint8 _feeMultiplier) public onlyOwner {
        feePercentX100 = _feeMultiplier;
    }

    function setPISVaultAddress(address _pisVaultAddress) public onlyOwner {
        pisVaultAddress = _pisVaultAddress;
        noFeeList[pisVaultAddress] = true;
    }

    function editNoFeeList(address _address, bool noFee) public onlyOwner {
        _editNoFeeList(_address, noFee);
    }

    function _editNoFeeList(address _address, bool noFee) internal {
        noFeeList[_address] = noFee;
    }

    function calculateAmountsAfterFee(
        address sender,
        address recipient, // unusued maybe use din future
        uint256 amount
    )
        public
        returns (
            uint256 transferToAmount,
            uint256 transferToFeeDistributorAmount
        )
    {
        require(paused == false, "FEE APPROVER: Transfers Paused");

        if (noFeeList[sender]) {
            // Dont have a fee when pisvault is sending, or infinite loop
            transferToFeeDistributorAmount = 0;
            transferToAmount = amount;
        } else {
            transferToFeeDistributorAmount = amount.mul(feePercentX100).div(
                1000
            );
            transferToAmount = amount.sub(transferToFeeDistributorAmount);
        }
    }
}
