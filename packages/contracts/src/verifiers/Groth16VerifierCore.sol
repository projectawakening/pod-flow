// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16VerifierCore {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 3769838596844952848645438302795617803424775814749668976377191985775761724656;
    uint256 constant deltax2 = 10468324282214525392387524430477132883319192318005134825872203644374089205595;
    uint256 constant deltay1 = 2573242292136734151743499354581292280597194905004953901524204728726988978968;
    uint256 constant deltay2 = 12337610756504343328058894819172629050528463117878768424095140903253097711660;

    
    uint256 constant IC0x = 9507640155497323993266848585858348535482579867426695656885336990746638990307;
    uint256 constant IC0y = 7252519220059826301911583216608392293450391072751072548929501739033212185058;
    
    uint256 constant IC1x = 8651721267575137877827648161126088822713086369002259783150116781715027474619;
    uint256 constant IC1y = 4000228094425536526132399457108965870636589291580429040557565035621199008393;
    
    uint256 constant IC2x = 17350778015248505474631250140486452642590196121251361039861788888863765495089;
    uint256 constant IC2y = 14321314012965627996582423417293380105873664436551255208517315699299588667084;
    
    uint256 constant IC3x = 11362652669281722630087833160595538875607790668086588747936814017171906266123;
    uint256 constant IC3y = 19165432051356560996037044910121718524422600580175105958415112514254117440200;
    
    uint256 constant IC4x = 8053963523372803132939094959996951024406490179691997271566477917036100138424;
    uint256 constant IC4y = 18968057913933262891258930405051142040208738757151344333816836769712148055531;
    
    uint256 constant IC5x = 17039041952631287909859682176900949654115014992755753308591879326147735478372;
    uint256 constant IC5y = 8412984131969279730703733168051233473929360611587294307817022157912592571950;
    
    uint256 constant IC6x = 906416166047251676276132289065872930597706646542432138317983807429669386241;
    uint256 constant IC6y = 19932492065818519183862607448271791416496030216509567285077161153914496221770;
    
    uint256 constant IC7x = 5234166068882380237297361673301354379647001267850108152917788858982165144909;
    uint256 constant IC7y = 2398594492482161459314064606872432978656514865448105369976771340458788893501;
    
    uint256 constant IC8x = 10825673457578828240106209129677819582402862459592403097233765548639899397669;
    uint256 constant IC8y = 9943034865215814681303508869402330254750925342277394327416616289879265842157;
    
    uint256 constant IC9x = 8897898268386630174023835135593175364610811067756371683474626376921910498963;
    uint256 constant IC9y = 10561225082808525835909453905200199237579095215232184490389441765208192773963;
    
    uint256 constant IC10x = 14537757075300679510992850289986506731550835252200458982394166801185308959148;
    uint256 constant IC10y = 10385606386320055014180047199988230721848971848383492242211715962361957767415;
    
    uint256 constant IC11x = 16755962152995131738253684624648035495626997567575725647770439335088417657921;
    uint256 constant IC11y = 9578127590448446977736458913702275628536384553136285548312693013573431256577;
    
    uint256 constant IC12x = 1797036154851772282502572611536233551484312292410170704217737804216764390473;
    uint256 constant IC12y = 11167355649634567312184834777586664665907971164606910777247680325014724659282;
    
    uint256 constant IC13x = 1750449697857776610658547383147505910819245085226913109844036154047627280709;
    uint256 constant IC13y = 7198100336176478331926394276674691649995178458718962863149018129857549084480;
    
    uint256 constant IC14x = 5094407251158139114090241906091080646917483366091577171522727686789176565308;
    uint256 constant IC14y = 19476519282494282907000991141634750472682647482895001121813735819755289460076;
    
    uint256 constant IC15x = 15451266729233482718889299285042358341759693510266149403576460767761343291413;
    uint256 constant IC15y = 6879654713151844627471868871214021605265901815035668829906515002394571993175;
    
    uint256 constant IC16x = 2219676735645373975014813963901888810074240425590280872402343475643218638221;
    uint256 constant IC16y = 15192145769638913729590881221825332650669069779270540955092007104641937368601;
    
    uint256 constant IC17x = 21436939210804168626200784471843279667916238197071526710759039222959868426011;
    uint256 constant IC17y = 11715971185068481697516779561620098788584245358998944400172613750266787776431;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[17] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
         }
     }
 }
