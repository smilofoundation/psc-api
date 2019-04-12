pragma solidity ^0.5.0;


contract SimpleStorage {

    address private _owner;

    string public storedData;

    constructor(string memory initVal) public {
        _owner = msg.sender;
        storedData = initVal;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    modifier onlyOwner() {
        require(isOwner());
        _;
    }

    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    function set(string memory x) public {
        storedData = x;
    }

    function get() public view returns (string memory retVal) {
        return storedData;
    }
}
