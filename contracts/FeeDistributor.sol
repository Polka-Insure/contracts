pragma solidity 0.6.12;
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./IPISVault.sol";
import "./IPISBaseToken.sol";

interface IStakePoolEpochReward {
    function allocateReward(uint256 _amount) external;
}

interface IEpochController {
    function epoch() external view returns (uint256);

    function nextEpochPoint() external view returns (uint256);

    function nextEpochLength() external view returns (uint256);

    function nextEpochAllocatedReward(address _pool)
        external
        view
        returns (uint256);
}

contract FeeDistributorProxy is
    OwnableUpgradeSafe,
    IPISVault,
    IEpochController
{
    using SafeMath for uint256;
    IPISVault public vault;
    address public faasPool;
    IPISBaseTokenEx public pis;
    uint256 public faasPoolPercentage;

    uint256 public _epoch = 0;
    uint256 public epochLength = 1 hours;
    uint256 public lastEpochTime;
    address public allocator;

    function initialize() public initializer {
        OwnableUpgradeSafe.__Ownable_init();
        vault = IPISVault(0xe3ABb69c22792Ba841450C61060367a539434724);
        pis = IPISBaseTokenEx(0x834cE7aD163ab3Be0C5Fd4e0a81E67aC8f51E00C);
        faasPoolPercentage = 20;
    }

    function epoch() external override view returns (uint256) {
        return _epoch;
    }

    function setFaasPool(address _pool) external onlyOwner {
        faasPool = _pool;
    }

    function nextEpochPoint() external override view returns (uint256) {
        return lastEpochTime + nextEpochLength();
    }

    function nextEpochLength() public override view returns (uint256) {
        return epochLength;
    }

    function setFaasPoolPercentage(uint256 _staking) external onlyOwner {
        faasPoolPercentage = _staking;
    }

    function allocateReward() public {
        uint256 _amount = nextEpochAllocatedReward(faasPool);
        uint256 _farming = _amount.mul(100 - faasPoolPercentage).div(100);
        pis.transfer(address(vault), _farming);
        vault.updatePendingRewards();

        _amount = _amount.sub(_farming);
        pis.approve(faasPool, _amount);
        IStakePoolEpochReward(faasPool).allocateReward(_amount);

        _epoch = _epoch + 1;
        lastEpochTime = block.timestamp;
    }

    function nextEpochAllocatedReward(address pool)
        public
        override
        view
        returns (uint256)
    {
        return pis.balanceOf(address(this));
    }

    function updatePendingRewards() external override {
        if (block.timestamp >= lastEpochTime.add(epochLength)) {
            allocateReward();
        }
    }

    function poolInfo(uint256 _pid)
        external
        override
        view
        returns (
            address,
            uint256,
            uint256,
            uint256,
            bool,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (address(0), 0, 0, 0, true, 0, 0, 0, 0);
    }

    function depositFor(
        address _depositFor,
        uint256 _pid,
        uint256 _amount
    ) external override {}
}
