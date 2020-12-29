pragma solidity 0.6.12;

interface INoFee {
    function noFeeList(address) external view returns (bool);
}
