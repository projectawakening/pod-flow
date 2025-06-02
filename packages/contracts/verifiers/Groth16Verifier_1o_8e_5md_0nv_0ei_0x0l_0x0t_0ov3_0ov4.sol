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

contract Groth16Verifier {
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
    uint256 constant deltax1 = 8739096569358286446549090566346052313965278057077523152678448578435892801137;
    uint256 constant deltax2 = 19827002643553557875259991109710469877282192117757117638060087421123777877146;
    uint256 constant deltay1 = 3727385496712744814007985069166240027456621852349294375283571896859786132839;
    uint256 constant deltay2 = 12130233086348310690271590072506279970527798205529689055799866723184395556522;

    
    uint256 constant IC0x = 1253261894914412066590056908453022901493935374851193447211472360723978332443;
    uint256 constant IC0y = 3330328739624600229911957401573220397193243874932670212022474778468637547176;
    
    uint256 constant IC1x = 8146626944953001474621102133241307172758468713235959533165005424309085945222;
    uint256 constant IC1y = 436818225917339612701145653928541601581227656264047019482416752199290706506;
    
    uint256 constant IC2x = 5200905349456297626059562088934864356068559811281621577869881759961640606425;
    uint256 constant IC2y = 16940253051411574510977340881472935075179706705021594320606203924544690747637;
    
    uint256 constant IC3x = 8850704312014004609817631024742986367606610341483989808765371970453865805627;
    uint256 constant IC3y = 898812853676839807078164160142940814169552068847460132560716097331124930208;
    
    uint256 constant IC4x = 10490129307965589432001792787226896700298549640576054116261735716996460674780;
    uint256 constant IC4y = 12371885631662191520618078092549573696988195051720752072873310454573728617833;
    
    uint256 constant IC5x = 668735581730521084954152284523990657448729904723568280587225243846414008890;
    uint256 constant IC5y = 19063401066730607157344175699145626415724384947385859259812696035770544219629;
    
    uint256 constant IC6x = 4455155408247357363117693281633774530927717074614840954321395999751794901814;
    uint256 constant IC6y = 9242653935679377320865084713533711884975670659518666322117255910416511730136;
    
    uint256 constant IC7x = 1608586122781450857947186511540907713414780419943174847584752972636261333154;
    uint256 constant IC7y = 10589377781434232446104693105381161590083604505274394535188554018583084107750;
    
    uint256 constant IC8x = 11819684970262765281892407265824244837151265156105434690237448893722931958853;
    uint256 constant IC8y = 18341390826589829885558872830434267556486912423587981434068408176111196215415;
    
    uint256 constant IC9x = 3576742849270885292124460586411181908350155493139430862698976764962057234849;
    uint256 constant IC9y = 20598805947454046205150830882451026413613833932849059771686795084899707671266;
    
    uint256 constant IC10x = 5973336785058296613024329623593149130295649590193673210810246829453832636616;
    uint256 constant IC10y = 4667892597558880844621308054598771815591042266093024467068621683449961298784;
    
    uint256 constant IC11x = 9920692161877274966680821036156732796846272182442696229549904750234844036482;
    uint256 constant IC11y = 14268627369744961485560876003783315507548413413378089700793186396133531207927;
    
    uint256 constant IC12x = 18786304640623539054512445707173959169392064990223888262693978277864380648192;
    uint256 constant IC12y = 1809093669362583810933868056900675398253592107056603440447971965236299295887;
    
    uint256 constant IC13x = 19828435056515342737080309386516012283427340759095456150481777772516584107680;
    uint256 constant IC13y = 3956455943791422734997682002033648361432259472215264468749260117804846790557;
    
    uint256 constant IC14x = 14606995175799458221345872712633698995412039508618006138704524155061191644120;
    uint256 constant IC14y = 18872255130484903513112447839659700702319526897651656792161030777567790965489;
    
    uint256 constant IC15x = 17402741842803057120255371852028903082594054209279545525325024173506791681222;
    uint256 constant IC15y = 14074784373389407699010815075050122346315811484599951737933680379239075941510;
    
    uint256 constant IC16x = 3328548472229719625138872426839230360479363938890732070318743171128739837243;
    uint256 constant IC16y = 6277511720224685556596851625868757388182948456089217354093204112242299177025;
    
    uint256 constant IC17x = 12213186849731763710994729033001217235219161358627773512230280565688476621389;
    uint256 constant IC17y = 3231015326053655856578114694677420653969107210697607187494469241551519988700;
    
    uint256 constant IC18x = 17624806095121367240678652952577493810364445535574700186456287523594820229615;
    uint256 constant IC18y = 21074007983026449106112806623563488082364756769518663395291219540506933154351;
    
    uint256 constant IC19x = 9309798420050627723743272575349364097813802451060107369812263995834674283763;
    uint256 constant IC19y = 5306452468247017403879553629084820564021385339233726159790023761278420120314;
    
    uint256 constant IC20x = 1053684603925177132871078076692018563658363568054627262249375416360133352103;
    uint256 constant IC20y = 5610555817443836090401680054932365665822365385307527665043976812547905597679;
    
    uint256 constant IC21x = 14095618822646077967956049067504263370221897765395571340736639706163941413550;
    uint256 constant IC21y = 4161235951467652476632430057939020936809001939776349657566227435006760884218;
    
    uint256 constant IC22x = 20137673302861897886816522887360753331858980903246926832738730160923422755343;
    uint256 constant IC22y = 13225980446731851286786475022935914085024782592301878139709147618820991160765;
    
    uint256 constant IC23x = 2763259583686796317766407940807399584569682958648729620167257851972368569897;
    uint256 constant IC23y = 21540605602799014649993189462838626594601824274979005085914664705723702191602;
    
    uint256 constant IC24x = 7397537319947407505382776304645940776855051919943973145781169776749227365386;
    uint256 constant IC24y = 14190145719069491313432970405827598105023737510494243169530839032967597441883;
    
    uint256 constant IC25x = 11832791378886107927262695340392143821568190392593699472437240153831029819724;
    uint256 constant IC25y = 13839709273576062193177265932507093141815515739017542592746588632650943154432;
    
    uint256 constant IC26x = 7904854831863889196333541384750871369365753437328467441219187121846511011396;
    uint256 constant IC26y = 9684702775840467739055368228695759818293322192245647766396466659450314227448;
    
    uint256 constant IC27x = 10912750583380748736651238398639086136578096959121840257619988520621513925118;
    uint256 constant IC27y = 2271306059321275649029976456384235159271867833848394021574752191204834514538;
    
    uint256 constant IC28x = 3069133773778456169246832716320334926840618995345163324018752913436045532057;
    uint256 constant IC28y = 5736637455085975255219683873317650407291843034403534345226452000287694427996;
    
    uint256 constant IC29x = 7886131010450407059387989372195372416674014619271443024256288769027844702970;
    uint256 constant IC29y = 16646174296505613642519647246217113198956976966049835385038311679685422114867;
    
    uint256 constant IC30x = 17958975617151228940126360878926840346751355637035184843767858105269076610325;
    uint256 constant IC30y = 13458325596897577595846004888316406878591147737203126830357342700392503942422;
    
    uint256 constant IC31x = 5106799839117897390431799908578219848044200740071415550864128844616734633162;
    uint256 constant IC31y = 13655475373115779324921982412962154154123620682130352417052251666412523455669;
    
    uint256 constant IC32x = 13605099000200942551871743194804825701685100072998952895648071932437936695344;
    uint256 constant IC32y = 10039262798296713976374290689555210503735356501611192994205608501752572201023;
    
    uint256 constant IC33x = 6361685002204580336934627741945683378117750590232332946603880480662624550648;
    uint256 constant IC33y = 6692022455876700271290910625967407989616015693813752137528409785173515790001;
    
    uint256 constant IC34x = 8633960401266929109149654982191326398878755086046899076414996877060761574635;
    uint256 constant IC34y = 9032038433739931002518334261522428915653791793567014001525943982651341194550;
    
    uint256 constant IC35x = 11918403999690989100001215627467844329766803471006138054895132973189334448498;
    uint256 constant IC35y = 11549762050969448996991656162368070891512519690346625965823354060504433547050;
    
    uint256 constant IC36x = 695852065028035313438636360295955580914556085998420711586017635882060474583;
    uint256 constant IC36y = 21427579701434622999146272248304742542677856659649264068067098498029325212834;
    
    uint256 constant IC37x = 4753105148297138353075618700175270604292590237884087672677127509854863240557;
    uint256 constant IC37y = 5562367459734616300202789853368666536101025849147334993826131803754739768051;
    
    uint256 constant IC38x = 8707542915232167579514060075414053583519118338505888782209053901072381104758;
    uint256 constant IC38y = 19261694529229744416537486974387427096616960316835246846866942764508436918594;
    
    uint256 constant IC39x = 9446997675180730505715639693860454297673118183384337261649864980527715464023;
    uint256 constant IC39y = 10048660714219621545816167546615584730622473627756157056274614013465870662523;
    
    uint256 constant IC40x = 3165873327186534981022254684336837789699950466217661865948582899873094005528;
    uint256 constant IC40y = 12656039306638879790642082299213619708679125486843703463351130870116669570734;
    
    uint256 constant IC41x = 16871567592064055057241721503101756851802067701900112384823286311846568181814;
    uint256 constant IC41y = 20245083852613476191656642849361721550879979592735359032692153097344909947012;
    
    uint256 constant IC42x = 21198083318689438788643475744577434324508659186342570196159172426272377539970;
    uint256 constant IC42y = 3064707061047114483331100250620855919899270304108719636062033696999873107618;
    
    uint256 constant IC43x = 8160234812631513711271119035657846841423415824094059799392377191143478669514;
    uint256 constant IC43y = 5921115628131382248224150180148619461980236291497291177449036401238713021504;
    
    uint256 constant IC44x = 21479913207274966313610357969762870747734133569867054549046872742202084473824;
    uint256 constant IC44y = 953401823867028521377936859604943528292106582274931084584118115152900291865;
    
    uint256 constant IC45x = 14307115398273136671914470921289350806093803600164540357578673037899584242075;
    uint256 constant IC45y = 18129462176486924857614289177564762739165792148966792225293243004684654230581;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[45] calldata _pubSignals) public view returns (bool) {
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
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                
                g1_mulAccC(_pVk, IC30x, IC30y, calldataload(add(pubSignals, 928)))
                
                g1_mulAccC(_pVk, IC31x, IC31y, calldataload(add(pubSignals, 960)))
                
                g1_mulAccC(_pVk, IC32x, IC32y, calldataload(add(pubSignals, 992)))
                
                g1_mulAccC(_pVk, IC33x, IC33y, calldataload(add(pubSignals, 1024)))
                
                g1_mulAccC(_pVk, IC34x, IC34y, calldataload(add(pubSignals, 1056)))
                
                g1_mulAccC(_pVk, IC35x, IC35y, calldataload(add(pubSignals, 1088)))
                
                g1_mulAccC(_pVk, IC36x, IC36y, calldataload(add(pubSignals, 1120)))
                
                g1_mulAccC(_pVk, IC37x, IC37y, calldataload(add(pubSignals, 1152)))
                
                g1_mulAccC(_pVk, IC38x, IC38y, calldataload(add(pubSignals, 1184)))
                
                g1_mulAccC(_pVk, IC39x, IC39y, calldataload(add(pubSignals, 1216)))
                
                g1_mulAccC(_pVk, IC40x, IC40y, calldataload(add(pubSignals, 1248)))
                
                g1_mulAccC(_pVk, IC41x, IC41y, calldataload(add(pubSignals, 1280)))
                
                g1_mulAccC(_pVk, IC42x, IC42y, calldataload(add(pubSignals, 1312)))
                
                g1_mulAccC(_pVk, IC43x, IC43y, calldataload(add(pubSignals, 1344)))
                
                g1_mulAccC(_pVk, IC44x, IC44y, calldataload(add(pubSignals, 1376)))
                
                g1_mulAccC(_pVk, IC45x, IC45y, calldataload(add(pubSignals, 1408)))
                

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
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            
            checkField(calldataload(add(_pubSignals, 928)))
            
            checkField(calldataload(add(_pubSignals, 960)))
            
            checkField(calldataload(add(_pubSignals, 992)))
            
            checkField(calldataload(add(_pubSignals, 1024)))
            
            checkField(calldataload(add(_pubSignals, 1056)))
            
            checkField(calldataload(add(_pubSignals, 1088)))
            
            checkField(calldataload(add(_pubSignals, 1120)))
            
            checkField(calldataload(add(_pubSignals, 1152)))
            
            checkField(calldataload(add(_pubSignals, 1184)))
            
            checkField(calldataload(add(_pubSignals, 1216)))
            
            checkField(calldataload(add(_pubSignals, 1248)))
            
            checkField(calldataload(add(_pubSignals, 1280)))
            
            checkField(calldataload(add(_pubSignals, 1312)))
            
            checkField(calldataload(add(_pubSignals, 1344)))
            
            checkField(calldataload(add(_pubSignals, 1376)))
            
            checkField(calldataload(add(_pubSignals, 1408)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
