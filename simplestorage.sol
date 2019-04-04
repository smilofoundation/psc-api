pragma solidity ^0.5.0;


contract SimpleStorage {

    string public storedData;

    constructor(string memory initVal) public {
        storedData = initVal;
    }

    function set(string memory x) public {
        storedData = x;
    }

    function get() public view returns (string memory retVal) {
        return storedData;
    }
}
