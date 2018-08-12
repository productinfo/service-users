//@flow

import type {
    TControllerConfig,
    TControllerParams,
    TControllerParamsReturn,
    TControllerDependenciesDefinition,
    TControllerActionReturn,
    TControllerRouteAclTable
} from 'paperframe/lib/Controller';

import type {
    JwtCredentials,
    JwtToken
} from '../../../ServiceProviders/Jwt';

const PaperworkController = require('paperwork-sdk-service-node/lib/PaperworkController');
const PaperworkStatusCodes = require('paperwork-sdk-service-node/lib/PaperworkStatusCodes');

const passport = require('koa-passport');
const Strategy = require('passport-local').Strategy;

const Joi = require('joi');
const HttpStatus = require('http-status-codes');

module.exports = class AuthLocalController extends PaperworkController {
    _auth:                      passport

    static get dependencies(): TControllerDependenciesDefinition {
        return ['database', 'kong', 'jwt'];
    }

    static get resource(): string {
        return 'authLocal';
    }

    static get route(): string {
        return '/auths/local';
    }

    get routeAcl(): TControllerRouteAclTable {
        let acl: TControllerRouteAclTable = {
            'create': {
                'protected': false
            }
        };

        return acl;
    }

    constructor(config: TControllerConfig) {
        super(config);
        this.aclToKong(AuthLocalController.resource, AuthLocalController.route, this.routeAcl);

        this._auth = passport;
        this._auth.use(new Strategy(async (username: string, password: string, callback: Function) => {
            const $user = this.$C('user');

            if(await $user.canLogInWith(username, password)) { // TODO: This is a mock check, replace with real code!
                callback(
                    null,
                    { // TODO: This is a mock response, replace with real code/response!
                        'id': '00000000-0000-0000-0000-000000000000',
                        'username': 'test',
                        'verified': 'true'
                    },
                    {
                        'message': 'Success'
                    }
                );
            } else {
                callback(
                    {
                        message: 'Incorrect username or password.'
                    },
                    false,
                    false,
                    {}
                );
            }
        }));
    }

    /**
     * Before CREATE handler
     */
    async beforeCreate(params: TControllerParams): TControllerParamsReturn {
        const schema = Joi.object().keys({
            'username': Joi.string().required(),
            'password': Joi.string().required()
        });

        return this.validate(params, schema);
    }

    /**
     * CREATE handler
     */
    async create(params: TControllerParams): TControllerActionReturn {
        const ctx = this.ctx;
        const next = this.next;

        return this._auth.authenticate('local', async (err, user, info) => {
            if(user === false || typeof user === 'undefined') {
                return this.response(HttpStatus.UNAUTHORIZED, PaperworkStatusCodes.AUTHENTICATION_FAILED, err);
            }

            try {
                const jwtCredentials: JwtCredentials = await this.$S('jwt').getCredentials(user.id);
                const jwtToken: JwtToken = await this.$S('jwt').getToken(jwtCredentials, { 'session': user });

                const response = {
                    'accessToken': jwtToken,
                    'user': user
                };

                return this.return(params, HttpStatus.OK, PaperworkStatusCodes.AUTHENTICATION_SUCCEEDED, response);
            } catch(error) {
                return this.return(params, HttpStatus.INTERNAL_SERVER_ERROR, PaperworkStatusCodes.AUTHENTICATION_ERROR, error);
            }
        })(ctx, next);
    }
};
